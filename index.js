/**
 * Host half of the Grid GUI plugin.
 *
 * The board itself is a browser surface, but the per-square icons a reader
 * picks have to outlive a reload and follow the account across browsers, so
 * they live in this plugin's own storage domain instead of the page. The
 * record is deliberately tiny: a picked icon is either one emoji or one image
 * the browser already downscaled, never the original file.
 *
 * Two routes carry the data:
 *   GET  /grid-gui/icons  -> { icons: { [key]: { kind, value } } }
 *   PUT  /grid-gui/icons  <- { key, icon: { kind, value } | null }
 *
 * The key is `w:<workspaceId>` or `s:<sessionId>`, so one table serves both
 * the Workspace squares and the Session squares.
 */

/** Cordis function-plugin name. */
const name = "dsh-grid-gui";

/**
 * `storageDomain` opens the table; `webServer` carries the two routes;
 * `connection` is the trust fence those routes must pass before answering.
 */
const inject = ["storageDomain", "webServer", "connection"];

/** The domain this plugin owns. Names are lower-case snake. */
const DOMAIN = "dsh_grid_gui";
/** One table: icons keyed by the square they belong to. */
const TABLE = "icons";
/** Route path carrying the whole table. */
const ICONS_PATH = "/grid-gui/icons";
/** Largest PUT body accepted: a downscaled image data URL fits with room. */
const MAX_BODY_BYTES = 256 * 1024;
/** Largest stored value. A 96px WebP icon lands around 4 KB; the ceiling
 * only exists so a hostile client cannot stuff the store. */
const MAX_VALUE_LENGTH = 128 * 1024;
/** Accepted icon kinds. */
const ICON_KINDS = ["emoji", "image"];
/** Projection key carrying why a Session's last turn ended. */
const OUTCOME_KEY = "gridGuiOutcome";

/**
 * Shape of the outcome projection. Hand-written rather than zod: this plugin
 * has no dependencies, and the registry only ever calls `parse`.
 */
const outcomeSchema = {
	parse(value) {
		const source = value !== null && typeof value === "object" ? value : {};
		return {
			kind: typeof source.kind === "string" ? source.kind : null,
			at: typeof source.at === "number" ? source.at : null,
			code: typeof source.code === "string" ? source.code : null,
		};
	},
};

/**
 * Why the last turn ended, as the Session log recorded it.
 *
 * `turn/end` carries `reason.kind`: `completed` for a clean finish, `error`
 * for a failed one, plus `aborted` and `interrupted`. The shipped status
 * store folds all of them into one "finished, unread" flag, so a request that
 * timed out reads exactly like a successful answer. This projection keeps the
 * distinction so the board can colour the two differently.
 *
 * @param {object} state - outcome before the event.
 * @param {object} event - next committed Session event.
 * @returns {object} the outcome after the event.
 */
function applyOutcome(state, event) {
	if (event.type === "turn/start") {
		/* Keep the same reference when nothing changes, so the registry does
		 * not report a change for every new turn. */
		return state.kind === null && state.at === null && state.code === null ? state : { kind: null, at: null, code: null };
	}
	if (event.type !== "turn/end") return state;
	const reason = event.data !== null && typeof event.data === "object" ? event.data.reason : undefined;
	const kind = reason !== null && typeof reason === "object" && typeof reason.kind === "string" ? reason.kind : null;
	const failure = reason !== null && typeof reason === "object" ? reason.error : undefined;
	const code = failure !== null && typeof failure === "object" && typeof failure.code === "string" ? failure.code : null;
	return { kind, at: typeof event.time === "number" ? event.time : null, code };
}

/**
 * Validator for one stored icon record.
 *
 * Hand-written rather than zod so this package stays import-free: the domain
 * layer only ever calls `parse` (on every stored record at open) and
 * `safeParse` (on a global, which this spec does not declare), so a two-method
 * object is the whole contract.
 */
const iconSchema = {
	/**
	 * @param {unknown} value - one stored record.
	 * @returns {{kind: string, value: string, updatedAt: string}} the record.
	 */
	parse(value) {
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			throw new Error("icon record must be an object");
		}
		const { kind, value: text, updatedAt } = value;
		if (!ICON_KINDS.includes(kind)) throw new Error(`icon kind must be one of ${ICON_KINDS.join(", ")}`);
		if (typeof text !== "string" || text === "") throw new Error("icon value must be a non-empty string");
		if (text.length > MAX_VALUE_LENGTH) throw new Error("icon value is too large");
		if (typeof updatedAt !== "string" || updatedAt === "") throw new Error("icon updatedAt must be an ISO timestamp");
		return { kind, value: text, updatedAt };
	},
	/**
	 * @param {unknown} value - candidate record.
	 * @returns {{success: boolean}} whether it validates.
	 */
	safeParse(value) {
		try {
			iconSchema.parse(value);
			return { success: true };
		} catch {
			return { success: false };
		}
	},
};

/**
 * The domain declaration. Written as a plain spec instead of going through
 * `defineDomain()` only to avoid an import the loader may not resolve from
 * this package; the shape is exactly what that helper produces.
 */
const domainSpec = {
	name: DOMAIN,
	version: 1,
	tables: { [TABLE]: { valueSchema: iconSchema } },
};

/**
 * Parse one `w:`/`s:` key into its parts.
 *
 * @param {unknown} key - wire value.
 * @returns {string|null} the key when it names a square, else null.
 */
function squareKey(key) {
	if (typeof key !== "string" || key.length < 3 || key.length > 200) return null;
	const head = key.slice(0, 2);
	if (head !== "w:" && head !== "s:") return null;
	return key;
}

/** JSON response, never cached: icons change as the reader picks them. */
function sendJson(res, status, payload) {
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(JSON.stringify(payload));
}

/**
 * Read a bounded request body.
 *
 * @param {object} req - Node request.
 * @returns {Promise<string>} the body text.
 */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(new Error("body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

/**
 * @param {object} ctx - Host plugin context.
 */
function apply(ctx) {
	let domain = null;
	let opening = null;

	/* Register the outcome projection when the composition mounts one. It is
	 * looked up rather than injected so the plugin still loads in a profile
	 * without sessions, where icons alone are still useful. */
	ctx.effect(() => {
		const projections = ctx.get("sessionProjections");
		if (projections === undefined || projections === null) return undefined;
		let dispose;
		let released = false;
		const ready = Promise.resolve(
			projections.register({
				key: OUTCOME_KEY,
				stateSchema: outcomeSchema,
				init: () => ({ kind: null, at: null, code: null }),
				apply: applyOutcome,
				wire: { viewSchema: outcomeSchema, view: (state) => state },
				stateVersion: 1,
			}),
		).then(
			(handle) => {
				/* The registry hands back a ProjectionHandle; releasing one
				 * reference is `dispose()`, not calling it. */
				if (released) {
					if (handle !== null && typeof handle === "object" && typeof handle.dispose === "function") handle.dispose();
					return;
				}
				dispose = handle;
			},
			(error) => {
				ctx.logger?.warn?.("grid-gui: turn outcome projection unavailable: %s", error?.message ?? error);
			},
		);
		return () => {
			released = true;
			ready.then(() => {
				if (dispose !== undefined && dispose !== null && typeof dispose.dispose === "function") dispose.dispose();
			});
		};
	}, "gridGui: turn outcome projection");

	/**
	 * Open the icons table once, on first use, and share the handle.
	 *
	 * @returns {Promise<object|null>} the open domain, or null when storage is
	 * not mounted in this composition.
	 */
	const open = () => {
		if (domain !== null) return Promise.resolve(domain);
		if (opening === null) {
			opening = ctx.storageDomain
				.open(domainSpec)
				.then((handle) => {
					domain = handle;
					ctx.effect(() => () => {
						domain = null;
						opening = null;
						return handle.close();
					}, "gridGui: icons domain");
					return handle;
				})
				.catch((error) => {
					opening = null;
					ctx.logger?.warn?.("grid-gui: icon storage unavailable: %s", error?.message ?? error);
					return null;
				});
		}
		return opening;
	};

	/** Reject an untrusted/unauthenticated request; true when it was rejected. */
	const rejected = (req, res) => {
		const connection = Reflect.get(ctx, "connection");
		const rejection = connection === undefined ? undefined : connection.requestRejection(req);
		if (rejection === undefined) return false;
		res.statusCode = rejection;
		res.end();
		return true;
	};

	ctx.effect(
		() =>
			ctx.webServer.register({
				kind: "exact",
				path: ICONS_PATH,
				handler: async (req, res) => {
					if (rejected(req, res)) return;
					const handle = await open();
					if (handle === null) {
						sendJson(res, 200, { icons: {}, storage: false });
						return;
					}
					const table = handle.table(TABLE);
					try {
						if (req.method === "GET" || req.method === "HEAD") {
							const icons = {};
							for (const [key, record] of table.entries()) {
								icons[key] = { kind: record.kind, value: record.value };
							}
							sendJson(res, 200, { icons, storage: true });
							return;
						}
						if (req.method !== "PUT") {
							res.statusCode = 405;
							res.setHeader("allow", "GET, PUT");
							res.end();
							return;
						}
						const body = await readBody(req);
						const parsed = JSON.parse(body);
						const key = squareKey(parsed?.key);
						if (key === null) {
							sendJson(res, 400, { error: "invalid-key" });
							return;
						}
						const icon = parsed?.icon;
						if (icon === null || icon === undefined) {
							await table.delete(key);
						} else {
							const record = iconSchema.parse({
								kind: icon.kind,
								value: icon.value,
								updatedAt: new Date().toISOString(),
							});
							await table.put(key, record);
						}
						sendJson(res, 200, { ok: true });
					} catch (error) {
						sendJson(res, 400, { error: "invalid-icon", message: String(error?.message ?? error) });
					}
				},
			}),
		`gridGui: ${ICONS_PATH}`,
	);
}

export { name, inject, apply };
