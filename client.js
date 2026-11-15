window.__ModuleLoader__.load({
	id: "dsh-grid-gui",
	factory(require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const h = React.createElement;
		const { Fragment, useCallback, useEffect, useMemo, useRef, useState } = React;

		/** Locale namespace of this plugin. */
		const NS = "gridGui";
		/** Stable key of the board panel inside the `main` slot. */
		const PANEL_ID = "board";
		/** `data-plugin-css` identity of the static sheet. */
		const STYLE_ID = "dsh-grid-gui";

		/** Smallest board square edge in px. */
		const CELL_MIN = 32;
		/** Largest board square edge in px; past this a square stops growing. */
		const CELL_MAX = 120;
		/** Gap between two squares, in px. */
		const GUTTER = 4;
		/** Key of the synthetic block that holds Sessions with no Workspace. */
		const LOOSE_KEY = "\u0000ungrouped";

		/* ------------------------------------------------------------------ *
		 * Locale
		 * ------------------------------------------------------------------ */

		const zh = {
			"board.search": "搜索工作区",
			"board.searchSession": "搜索本工作区的会话",
			"board.wsUnit": "个工作区",
			"board.sessUnit": "个会话",
			"board.empty": "还没有任何工作区",
			"board.emptyHint": "在侧边栏新建一个工作区之后，这里会长出第一块方格。",
			"board.emptyRoom": "这个工作区还没有会话",
			"board.emptyRoomHint": "点虚线方格就能开一个。",
			"board.newSession": "新建并进入会话",
			"board.newSessionHint": "新建后直接进入新会话页",
			"board.open": "进入会话",
			"board.pinSession": "置顶会话",
			"board.unpinSession": "取消置顶",
			"board.archiveSession": "归档会话",
			"board.renameWorkspace": "重命名工作区",
			"board.deleteWorkspace": "删除工作区",
			"board.deleteText": "删除工作区「{title}」？只解除登记，会话与文件都保留。",
			"board.confirm": "确定",
			"board.cancel": "取消",
			"board.delete": "删除",
			"board.back": "棋盘",
			"board.backHint": "回到工作区棋盘",
			"board.ungrouped": "未归类",
			"board.reorderHint": "Ctrl + 拖动方块可在本工作区内换位",
			"board.rodsEmpty": "没有工作区",
			"board.enter": "进入工作区",
			"board.rodHint": "长度占全部会话的比例，颜色为状态构成；点击进入该工作区",
			"board.changeIcon": "换个图标",
			"board.iconTitle": "换个图标",
			"board.iconUpload": "选一张图",
			"board.iconWorking": "处理中…",
			"board.iconReset": "恢复默认",
			"board.iconHint": "图片会缩到 96×96、转成黑白再保存，只留明暗，颜色照旧由方块给。",
		};

		const en = {
			"board.search": "Search Workspaces",
			"board.searchSession": "Search Sessions in this Workspace",
			"board.wsUnit": "Workspaces",
			"board.sessUnit": "Sessions",
			"board.empty": "No Workspace yet",
			"board.emptyHint": "Create a Workspace from the sidebar and its first square appears here.",
			"board.emptyRoom": "This Workspace has no Session yet",
			"board.emptyRoomHint": "Click the dashed square to start one.",
			"board.newSession": "New Session and open it",
			"board.newSessionHint": "Starts a Session and opens it right away",
			"board.open": "Open Session",
			"board.pinSession": "Pin Session",
			"board.unpinSession": "Unpin Session",
			"board.archiveSession": "Archive Session",
			"board.renameWorkspace": "Rename Workspace",
			"board.deleteWorkspace": "Delete Workspace",
			"board.deleteText": "Delete Workspace \"{title}\"? Only the registration is removed; Sessions and files stay.",
			"board.confirm": "Confirm",
			"board.cancel": "Cancel",
			"board.delete": "Delete",
			"board.back": "Board",
			"board.backHint": "Return to the Workspace board",
			"board.ungrouped": "Ungrouped",
			"board.reorderHint": "Ctrl-drag a square to reorder inside this Workspace",
			"board.rodsEmpty": "No Workspace",
			"board.enter": "Enter Workspace",
			"board.rodHint": "Length is the share of all Sessions, colour is the status mix; click to enter",
			"board.changeIcon": "Change icon",
			"board.iconTitle": "Change icon",
			"board.iconUpload": "Choose a picture",
			"board.iconWorking": "Working…",
			"board.iconReset": "Use the default",
			"board.iconHint": "The picture is shrunk to 96×96 and turned grey, so it keeps only light and shade; the square keeps the colour.",
		};

		/* ------------------------------------------------------------------ *
		 * View store
		 * ------------------------------------------------------------------ */

		/**
		 * The board's two layers live in one panel: `null` is the Workspace
		 * grid, a block key is that Workspace's Session grid. The store lives
		 * outside React so the header button can climb back out while the
		 * panel is unmounted.
		 */
		const view = { key: null, listeners: new Set() };

		/**
		 * @param {string|null} key - block key to show, or null for the grid.
		 */
		function setView(key) {
			if (view.key === key) return;
			view.key = key;
			for (const listener of view.listeners) listener(key);
		}

		/**
		 * @returns {string|null} the block key currently entered.
		 */
		function currentView() {
			return view.key;
		}

		/* ------------------------------------------------------------------ *
		 * Picked icons
		 * ------------------------------------------------------------------ */

		/** Route the Host half serves the icon table on. */
		const ICONS_PATH = "/grid-gui/icons";
		/** Edge of the copy an uploaded picture is shrunk to before storing. */
		const ICON_IMAGE_EDGE = 96;
		/** How hard the shrunk copy is compressed; WebP keeps it a few KB. */
		const ICON_IMAGE_QUALITY = 0.85;
		/** How much of the square a picked face covers: full bleed, see-through. */
		const ICON_OPACITY = 0.55;
		/** Quick picks offered in the icon dialog. */
		const ICON_EMOJI = [
			"\u{1F5C2}", "\u{1F6E0}", "\u{1F4D0}", "\u{1F3A8}", "\u{1F9EA}", "\u{1F4E6}",
			"\u{1F680}", "\u{1F331}", "\u{1F525}", "\u{1F30A}", "\u{1F9ED}", "\u{1F3AF}",
			"\u{1F4DD}", "\u{1F527}", "\u{1F9E9}", "\u{1FA90}", "\u{1F989}", "\u{1F419}",
			"\u{1F340}", "\u2615", "\u{1F4A1}", "\u{1F9F1}", "\u{1F5FA}", "\u{1F3B9}",
		];

		/**
		 * Icons the reader picked, keyed `w:<workspaceId>` or `s:<sessionId>`.
		 * Kept outside React so the sidebar rods, the Workspace layer and the
		 * Session layer all read one copy instead of three.
		 */
		const icons = { map: new Map(), listeners: new Set(), loading: null, loaded: false };

		/**
		 * @param {string} key - square identity.
		 * @returns {{kind: string, value: string}|undefined} the picked face.
		 */
		function iconOf(key) {
			return icons.map.get(key);
		}

		/** Tell every mounted reader that the map changed. */
		function notifyIcons() {
			for (const listener of icons.listeners) listener();
		}

		/**
		 * Pull the stored table once per page. A failure is not reported: the
		 * squares simply keep their generated marks.
		 */
		function loadIcons() {
			if (icons.loaded) return Promise.resolve();
			if (icons.loading !== null) return icons.loading;
			icons.loading = fetch(ICONS_PATH, { credentials: "same-origin" })
				.then((response) => (response.ok ? response.json() : null))
				.then((payload) => {
					if (payload === null || payload.icons === null || payload.icons === undefined) return;
					icons.map = new Map(Object.entries(payload.icons));
					icons.loaded = true;
					notifyIcons();
				})
				.catch(() => undefined)
				.then(() => {
					icons.loading = null;
				});
			return icons.loading;
		}

		/**
		 * Write one square's face through, optimistically: the square changes
		 * at once and the durable copy follows.
		 *
		 * @param {string} key - square identity.
		 * @param {{kind: string, value: string}|null} icon - face, or null to
		 * drop back to the generated mark.
		 */
		function storeIcon(key, icon) {
			const next = new Map(icons.map);
			if (icon === null) next.delete(key);
			else next.set(key, icon);
			icons.map = next;
			notifyIcons();
			fetch(ICONS_PATH, {
				method: "PUT",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ key, icon }),
			}).catch(() => undefined);
		}

		/**
		 * Strip the colour out of a drawn square, in place.
		 *
		 * A picked face is laid over the square with `mix-blend-mode:
		 * luminosity`, so the sheet only ever contributes light and shade and
		 * the square keeps supplying the hue. Storing it grey rather than
		 * coloured means the same icon reads blue on a running Workspace and
		 * green on a finished one, which is what a lit panel does, and a
		 * grey WebP is a good deal smaller than a colour one.
		 *
		 * @param {CanvasRenderingContext2D} context - the square's context.
		 * @param {number} edge - square edge in px.
		 */
		function desaturate(context, edge) {
			const data = context.getImageData(0, 0, edge, edge);
			const pixels = data.data;
			const count = pixels.length;
			let low = 255;
			let high = 0;
			for (let index = 0; index < count; index += 4) {
				/* Rec. 709 luma: the eye reads green as most of the brightness. */
				const grey = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
				pixels[index] = grey;
				pixels[index + 1] = grey;
				pixels[index + 2] = grey;
				if (grey < low) low = grey;
				if (grey > high) high = grey;
			}
			/* A picked picture is drawn over the square in a luminosity blend,
			 * so the only thing it can say is light and dark. Most photographs
			 * arrive bunched around mid grey, which would leave the icon all but
			 * invisible. Widen the range it actually uses — stopping short of
			 * pure black and white, which would turn a photograph into a
			 * stencil, and capping the gain so a flat picture cannot end up as
			 * noise. */
			const span = high - low;
			if (span > 6) {
				const gain = Math.min(6, 210 / span);
				for (let index = 0; index < count; index += 4) {
					const grey = Math.max(0, Math.min(255, 22 + (pixels[index] - low) * gain));
					pixels[index] = grey;
					pixels[index + 1] = grey;
					pixels[index + 2] = grey;
				}
			}
			context.putImageData(data, 0, 0);
		}

		/**
		 * Shrink one picture to a square PNG data URL. The original file never
		 * leaves the browser, and what gets stored stays small enough to travel
		 * with the Workspace record.
		 *
		 * @param {File} file - picture the reader chose.
		 * @returns {Promise<string>} the data URL.
		 */
		function shrinkImage(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(reader.error ?? new Error("unreadable file"));
				reader.onload = () => {
					const image = new Image();
					image.onerror = () => reject(new Error("unreadable image"));
					image.onload = () => {
						const edge = ICON_IMAGE_EDGE;
						const canvas = document.createElement("canvas");
						canvas.width = edge;
						canvas.height = edge;
						const context = canvas.getContext("2d");
						if (context === null) {
							reject(new Error("no 2d context"));
							return;
						}
						const scale = Math.max(edge / image.width, edge / image.height);
						const width = image.width * scale;
						const height = image.height * scale;
						context.drawImage(image, (edge - width) / 2, (edge - height) / 2, width, height);
						desaturate(context, edge);
						/* WebP is roughly a seventh the size of PNG for a picture
						 * this small; a square is drawn over the status colour, so
						 * nothing needs transparency. Anyone compiling a browser
						 * without it still gets a working PNG. */
						const webp = canvas.toDataURL("image/webp", ICON_IMAGE_QUALITY);
						resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png"));
					};
					image.src = String(reader.result);
				};
				reader.readAsDataURL(file);
			});
		}

		/**
		 * @param {string} key - square identity.
		 * @param {string} title - the square's own name.
		 * @returns {object} the face element: picked icon, else generated mark.
		 */
		function renderFace(key, title) {
			const icon = iconOf(key);
			if (icon === undefined) {
				return h("span", { className: "tb-cell-glyph", "aria-hidden": true }, glyphFor(title));
			}
			const style = { "--tb-face-opacity": String(ICON_OPACITY) };
			if (icon.kind === "emoji") {
				return h("span", { className: "tb-cell-face is-emoji", style, "aria-hidden": true }, icon.value);
			}
			return h("img", {
				className: "tb-cell-face is-image",
				style,
				src: icon.value,
				alt: "",
				draggable: false,
			});
		}

		/**
		 * Subscribe one component to the icon map.
		 *
		 * @returns {Map} the current icon map.
		 */
		function useIcons() {
			const [, bump] = useState(0);
			useEffect(() => {
				const listener = () => bump((n) => n + 1);
				icons.listeners.add(listener);
				loadIcons();
				return () => {
					icons.listeners.delete(listener);
				};
			}, []);
			return icons.map;
		}

		/* ------------------------------------------------------------------ *
		 * Data projection
		 * ------------------------------------------------------------------ */

		/**
		 * Stable 32-bit hash of a title, so one title always draws the same
		 * mark. FNV-1a is enough: it is short, and nothing here is security
		 * sensitive.
		 *
		 * @param {string} text - the title to hash.
		 * @returns {number} an unsigned 32-bit hash.
		 */
		function titleHash(text) {
			let hash = 0x811c9dc5;
			for (let i = 0; i < text.length; i += 1) {
				hash ^= text.charCodeAt(i);
				hash = Math.imul(hash, 0x01000193) >>> 0;
			}
			return hash >>> 0;
		}

		/**
		 * Draw the mark for a square from its own title. The title is hashed,
		 * the hash seeds a small deterministic pattern generator, and the
		 * result is a monochrome SVG that inherits `currentColor`. Nothing is
		 * stored, so a square's mark survives a reload, and renaming a
		 * Workspace gives it a new mark because the name is the seed.
		 *
		 * The pattern is a seeded set of occupied cells in a 4x4 lattice plus
		 * one of five primitive shapes, which keeps 17 squares visually
		 * distinct without ever leaving the grey.
		 *
		 * @param {string} title - the Workspace or Session title.
		 * @returns {object} an SVG element drawn on a 24 unit grid.
		 */
		function glyphFor(title) {
			const seed = titleHash(title);
			/* A tiny LCG walks the lattice so neighbouring hashes do not give
			 * neighbouring marks; Math.random is not usable here because the
			 * mark has to be identical on every render. */
			let state = seed || 1;
			const next = () => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
				return state;
			};
			const shape = seed % 5;
			const cells = [];
			const wanted = 3 + (seed % 3);
			const taken = new Set();
			for (let guard = 0; guard < 64 && cells.length < wanted; guard += 1) {
				const slot = next() % 16;
				if (taken.has(slot)) continue;
				taken.add(slot);
				cells.push([slot % 4, Math.floor(slot / 4)]);
			}
			const parts = cells.map((cell, index) => {
				const cx = 4 + cell[0] * 5.4;
				const cy = 4 + cell[1] * 5.4;
				const jitter = (next() % 5) * 0.14;
				const size = 2.1 + jitter;
				if (shape === 0) {
					return h("circle", { key: "m" + index, cx, cy, r: size, fill: "currentColor" });
				}
				if (shape === 1) {
					return h("rect", {
						key: "m" + index,
						x: cx - size,
						y: cy - size,
						width: size * 2,
						height: size * 2,
						fill: "currentColor",
					});
				}
				if (shape === 2) {
					return h("circle", { key: "m" + index, cx, cy, r: size, fill: "none", stroke: "currentColor", strokeWidth: 1.4 });
				}
				if (shape === 3) {
					return h("rect", {
						key: "m" + index,
						x: cx - size - 0.6,
						y: cy - 0.7,
						width: (size + 0.6) * 2,
						height: 1.4,
						rx: 0.7,
						fill: "currentColor",
					});
				}
				return h("path", {
					key: "m" + index,
					d: "M" + String(cx - size) + " " + String(cy + size) + "L" + String(cx) + " " + String(cy - size) + "L" + String(cx + size) + " " + String(cy + size),
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.4,
					strokeLinejoin: "round",
				});
			});
			return h("svg", { viewBox: "0 0 24 24", "aria-hidden": true, focusable: "false" }, parts);
		}

		/**
		 * Arrange a set of squares as a near-square matrix: the column count is
		 * the square root of the count, so a grid of 17 reads as 5x4 rather
		 * than one long row.
		 *
		 * @param {number} count - number of squares to arrange.
		 * @returns {number} the column count, at least 1.
		 */
		function squareColumns(count) {
			if (count <= 1) return 1;
			return Math.ceil(Math.sqrt(count));
		}

		/**
		 * @param {Map|undefined} statuses - `useSessionStatus` snapshot.
		 * @param {string} sessionId - Session to classify.
		 * @returns {string} `wait`, `done`, `run`, or `idle`.
		 */
		function statusOf(statuses, sessionId) {
			const status = statuses === undefined ? undefined : statuses.get(sessionId);
			if (status === undefined) return "idle";
			if (status.pendingInteraction !== undefined) return "wait";
			if (status.completionUnread === true) return "done";
			if (status.running === true) return "run";
			return "idle";
		}

		/**
		 * Project the Workspace snapshot plus the Session list into blocks:
		 * registry order, archived and unknown Sessions dropped, and one
		 * trailing block for Sessions that belong to no Workspace.
		 *
		 * Visibility follows the shipped browser exactly: a subagent
		 * transcript is not a Session a reader navigates to, and a blank row
		 * is the "new Session" placeholder — the Session grid already offers a
		 * free square for that, so both are omitted rather than bloating the
		 * grids with rows that have no title.
		 *
		 * @param {object} snapshot - `useWorkspaces` snapshot.
		 * @param {object} list - `useSessions` snapshot.
		 * @param {string} ungroupedTitle - localized title of the loose block.
		 * @returns {Array} blocks `{ key, workspaceId, title, sessionIds }`.
		 */
		function buildBlocks(snapshot, list, ungroupedTitle) {
			const archived = new Set(snapshot.archivedSessionIds ?? []);
			const byId = list.byId ?? {};
			const known = (id) => {
				const row = byId[id];
				if (row === undefined) return false;
				if (archived.has(id)) return false;
				if (row.origin === "subagent") return false;
				if (row.blank === true) return false;
				return true;
			};
			const blocks = [];
			const accounted = new Set();
			for (const item of snapshot.items ?? []) {
				const sessionIds = (item.sessionIds ?? []).filter(known);
				for (const id of sessionIds) accounted.add(id);
				blocks.push({
					key: item.workspaceId,
					workspaceId: item.workspaceId,
					title: item.title === undefined || item.title === "" ? ungroupedTitle : item.title,
					sessionIds,
				});
			}
			const loose = (list.ids ?? []).filter((id) => known(id) && !accounted.has(id));
			/* A Session started from the add square belongs at the end of the
			 * grid, but a blank Session has no messages yet, so the shipped
			 * list has nothing to sort it by and parks it at the head. Sort
			 * every block newest-first instead: one rule for both layers,
			 * and the add square stays the last square on the board.
			 * `list.ids` is already newest-first, so its index is the rank. */
			const rank = new Map();
			(list.ids ?? []).forEach((id, index) => rank.set(id, index));
			const byRecency = (ids) =>
				ids.slice().sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
			for (const block of blocks) block.sessionIds = byRecency(block.sessionIds);
			const looseSorted = byRecency(loose);
			if (looseSorted.length > 0) {
				blocks.push({
					key: LOOSE_KEY,
					workspaceId: undefined,
					title: ungroupedTitle,
					sessionIds: looseSorted,
				});
			}
			return blocks;
		}

		/**
		 * @param {object} list - `useSessions` snapshot.
		 * @param {string} sessionId - Session to label.
		 * @returns {string} the human-facing title.
		 */
		function sessionTitle(list, sessionId) {
			const row = list.byId === undefined ? undefined : list.byId[sessionId];
			if (row === undefined) return sessionId;
			if (row.displayTitle !== undefined && row.displayTitle !== "") return row.displayTitle;
			return sessionId;
		}

		/**
		 * @param {object} list - `useSessions` snapshot.
		 * @param {string} sessionId - Session to test.
		 * @returns {boolean} true while this Session holds the main view.
		 */
		function isCurrent(list, sessionId) {
			const row = list.byId === undefined ? undefined : list.byId[sessionId];
			return row !== undefined && (row.retainedBy?.mainView ?? 0) > 0;
		}

		/**
		 * @param {object} list - `useSessions` snapshot.
		 * @param {Array} sessionIds - Sessions of one block.
		 * @returns {boolean} true when one of them holds the main view.
		 */
		function blockIsCurrent(list, sessionIds) {
			for (const id of sessionIds) if (isCurrent(list, id)) return true;
			return false;
		}

		/**
		 * Count the status mix of one block, the input of a sidebar rod.
		 *
		 * @param {Map|undefined} statuses - `useSessionStatus` snapshot.
		 * @param {Array} sessionIds - Sessions of one block.
		 * @returns {{run: number, wait: number, done: number, idle: number}} the mix.
		 */
		/**
		 * Whether the reader asked for reduced motion.
		 * @returns {boolean} true when animation should be skipped.
		 */
		function prefersReducedMotion() {
			return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
		}

		/** Left inset of a sidebar rod bar, in px. */
		const ROD_INSET = 8;
		/** Full length of a sidebar rod bar, in px; resting length is 60%. */
		const ROD_BAR = 120;

		/** Status bands, in the order they are considered for a rod. */
		const STATUS_ORDER = ["run", "wait", "done", "idle"];

		function statusMix(statuses, sessionIds) {
			const mix = { run: 0, wait: 0, done: 0, idle: 0 };
			for (const id of sessionIds) mix[statusOf(statuses, id)] += 1;
			return mix;
		}

		/**
		 * Which statuses a Workspace actually holds, as one of the seven
		 * non-empty combinations of run / wait / done. Idle Sessions are
		 * ignored on purpose: a Workspace sitting on forty idle Sessions and
		 * one running Session is running, not seventy-five percent asleep.
		 *
		 * @param {object} mix - a count per status from `statusMix`.
		 * @returns {string} e.g. `is-c-run-wait`, or an empty string when idle.
		 */
		function statusCombo(mix) {
			const live = mix.run > 0;
			const waiting = mix.wait > 0;
			const done = mix.done > 0;
			const parts = [];
			if (done) parts.push("done");
			if (live) parts.push("run");
			if (waiting) parts.push("wait");
			if (parts.length === 0) return "";
			/* Two statuses side by side are drawn as two halves, one status
			 * per corner, so the square carries both colours instead of a
			 * blend that would average them into something neither of them
			 * is. */
			const pair = parts.length === 2 ? " is-c-pair" : "";
			return " is-c-" + parts.join("-") + pair + (live ? " is-c-live" : "") + " is-colored";
		}

		/* ------------------------------------------------------------------ *
		 * Styles
		 * ------------------------------------------------------------------ */

		const CSS = `
.tb-board {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: var(--dsw-alias-bg-layer-1);
	color: var(--dsw-alias-label-primary);
}
.tb-bar {
	display: flex;
	flex: none;
	align-items: center;
	gap: 10px;
	padding: 10px 20px 4px;
}
.tb-search {
	flex: 0 1 240px;
	min-width: 120px;
	height: 28px;
	padding: 0 10px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 6px;
	background: var(--dsw-alias-bg-layer-2);
	color: var(--dsw-alias-label-primary);
	font: inherit;
	font-size: 13px;
	outline: none;
}
.tb-search:focus {
	border-color: var(--dsw-alias-brand-primary);
}
.tb-crumb {
	flex: none;
	display: inline-flex;
	align-items: center;
	gap: 5px;
	height: 26px;
	padding: 0 9px 0 7px;
	border: 1px solid var(--dsw-alias-border-l1);
	border-radius: 6px;
	background: transparent;
	color: var(--dsw-alias-label-secondary);
	font: inherit;
	font-size: 12px;
	cursor: pointer;
}
.tb-crumb:hover {
	border-color: var(--dsw-alias-border-l2);
	color: var(--dsw-alias-label-primary);
}
.tb-crumb-glyph {
	font-size: 12px;
	line-height: 1;
}
.tb-title {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
	font-weight: 500;
	color: var(--dsw-alias-label-primary);
}
.tb-legend {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 12px;
	color: var(--dsw-alias-label-secondary);
}
.tb-viewport {
	display: flex;
	flex: 1 1 auto;
	align-items: center;
	justify-content: center;
	min-height: 0;
	overflow: auto;
	padding: 10px 20px 30px;
}
.tb-grid {
	display: grid;
	grid-template-columns: repeat(var(--tb-cols, 4), var(--tb-cell, 32px));
	grid-auto-rows: var(--tb-cell, 32px);
	gap: ${GUTTER}px;
	justify-content: center;
	align-content: center;
}
.tb-cell {
	position: relative;
	--tb-run: var(--dsw-alias-state-business-primary, #4176e6);
	--tb-wait: var(--dsw-alias-state-warn-primary, #f59e0b);
	--tb-done: var(--dsw-alias-state-success-primary, #22c55e);
	box-sizing: border-box;
	width: var(--tb-cell, 32px);
	height: var(--tb-cell, 32px);
	padding: 0;
	border: 0;
	border-radius: 0;
	background: var(--tb-face, var(--dsw-alias-state-idle-primary));
	cursor: pointer;
	transition: background-color 0.12s ease, filter 0.12s ease, opacity 0.15s ease;
}
.tb-cell:hover {
	z-index: 2;
}
/* Layer one reads as lit panels rather than paint: the face is brightest in
 * the middle and falls off towards the corners, which is how a lit panel
 * looks in the dark. Layer two keeps the flat face, so the two layers
 * are told apart by surface, not only by what is written on them. */
.tb-cell[data-wskey] {
	--tb-face: var(--dsw-alias-state-idle-primary);
	/* A fixed lift rather than a mix with white: proportions would glow hard
	 * in the dark theme and barely at all in the light one. */
	--tb-hot: rgb(from var(--tb-face) calc(r + 30) calc(g + 30) calc(b + 30));
	/* The base is the lit colour; a frame of the plain face colour is laid
	 * over the four edges. Nothing gets darker than the face colour, and the
	 * area that stays uncovered is a square in the middle, so the block reads
	 * as a panel glowing from the centre — not a round spotlight, not a
	 * blackened border. */
	background-color: var(--tb-hot);
	background-image:
		linear-gradient(to right, var(--tb-face) 0%, var(--tb-face) 12%, transparent 34%),
		linear-gradient(to left, var(--tb-face) 0%, var(--tb-face) 12%, transparent 34%),
		linear-gradient(to bottom, var(--tb-face) 0%, var(--tb-face) 12%, transparent 34%),
		linear-gradient(to top, var(--tb-face) 0%, var(--tb-face) 12%, transparent 34%);
}
.tb-cell[data-wskey]:not(.is-colored):hover {
	--tb-face: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary));
}
.tb-cell[data-sid]:hover {
	background: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary));
}
/* A Workspace square takes the colour of the statuses its own Sessions are
 * in. Only run / wait / done count, so a quiet Workspace stays grey however
 * many idle Sessions it holds. Seven combinations, all read off three pure
 * colours: three singles, three pairs, and one square where all three occur.
 *
 * A single status is one flat colour. A pair is split into two halves, one
 * colour at each corner, with an empty band between them. All three at once
 * stays one flat colour: a square holding three colours stops being readable
 * at a glance, and the whole point of the board is reading it at a glance. */
.tb-cell.is-c-run {
	--tb-face: var(--tb-run);
}
.tb-cell.is-c-wait {
	--tb-face: var(--tb-wait);
}
.tb-cell.is-c-done {
	--tb-face: var(--tb-done);
}
/* Two statuses at once are not blended into one colour: a blend would average
 * them into a third colour that is neither, and blue + amber averages to grey.
 * The square carries both instead — one pure colour at the top-left corner,
 * the other at the bottom-right — and nothing at all between them. The band
 * between the two halves stays empty, so the square only ever shows the two
 * colours that are actually present, never a third one invented by mixing.
 * The order is fixed (run, then wait, then done) so the same pair always
 * reads the same way. */
.tb-cell.is-c-done-run {
	--tb-face-a: var(--tb-run);
	--tb-face-b: var(--tb-done);
}
.tb-cell.is-c-run-wait {
	--tb-face-a: var(--tb-run);
	--tb-face-b: var(--tb-wait);
}
.tb-cell.is-c-done-wait {
	--tb-face-a: var(--tb-wait);
	--tb-face-b: var(--tb-done);
}
/* The corners have to stay pure, so a two-colour square drops the lit-panel
 * frame the single-colour squares wear: that frame darkens the edges, which
 * is exactly where the two pure colours sit.
 *
 * Reading along the diagonal: one colour flat, a fade out, a band with no
 * colour at all, a fade in, the other colour flat. The two colours never
 * meet — the first has finished fading before the second starts — so
 * nothing is ever blended between them, and the middle is the board
 * showing through. The fades are what keep it from reading as a cut. */
.tb-cell[data-wskey].is-c-pair {
	--tb-face: var(--tb-face-a);
	background-color: transparent;
	background-image: none;
}
/* The two colours have to reach the four edges, so they are laid down as two
 * halves that meet on the anti-diagonal — a hard seam, because any soft seam
 * would put a third, blended colour on the top-right and bottom-left corners.
 * What keeps it from reading as a cut is the hole: the middle is masked away,
 * so the two colours dissolve into the board just before they would meet.
 * The face lives on a pseudo-element because the mask must not eat the glyph. */
.tb-cell[data-wskey].is-c-pair::before {
	content: "";
	position: absolute;
	inset: 0;
	background-image: linear-gradient(
		135deg,
		var(--tb-face-a) 0 50%,
		var(--tb-face-b) 50% 100%
	);
	mask-image: radial-gradient(circle at 50% 50%, transparent 0 13%, #000 31%);
}
/* A two-colour square still has to read as a lit panel, or it stops looking
 * like a Workspace square at all. The four-frame trick the flat squares use
 * cannot be copied here: those frames paint the face colour over the border,
 * which would bury the two pure corners and plug the empty band where it
 * crosses the edges. So the same square-shaped centre is cut out as a mask
 * instead, and the centre is lifted with a backdrop filter — the face is
 * left exactly as drawn, only brighter towards the middle. */
.tb-cell[data-wskey].is-c-pair::after {
	content: "";
	position: absolute;
	inset: 0;
	pointer-events: none;
	backdrop-filter: brightness(1.16);
	mask-image:
		linear-gradient(to right, transparent 0 12%, #000 34%),
		linear-gradient(to left, transparent 0 12%, #000 34%),
		linear-gradient(to bottom, transparent 0 12%, #000 34%),
		linear-gradient(to top, transparent 0 12%, #000 34%);
	mask-composite: intersect;
}
/* All three at once has no free arc left: every point between the three
 * primaries already belongs to a pair, so a blend of all three always lands
 * on top of one of them. This state therefore takes the one hue none of the
 * singles or pairs uses — violet — as a fixed value rather than a blend. */
.tb-cell.is-c-done-run-wait {
	--tb-face: #a369de;
}
.tb-cell.is-colored:hover {
	filter: brightness(1.12);
}
.tb-cell.is-colored .tb-cell-glyph {
	color: var(--dsw-static-neutral-50, #ffffff);
	opacity: 0.62;
}
.tb-cell.is-c-live .tb-cell-glyph {
	animation: tb-glyph-pulse 1.8s ease-in-out infinite;
}
@keyframes tb-glyph-pulse {
	0%, 100% { opacity: 0.45; }
	50% { opacity: 0.95; }
}
.tb-cell:focus-visible {
	outline: 2px solid var(--dsw-alias-brand-primary);
	outline-offset: 2px;
}
.tb-cell.is-run {
	background: var(--dsw-alias-state-business-primary);
	animation: tb-cell-breathe 1.8s ease-in-out infinite;
}
.tb-cell.is-wait {
	background: var(--dsw-alias-state-warn-primary);
}
.tb-cell.is-done {
	background: var(--dsw-alias-state-success-primary);
}
.tb-cell.is-current {
	outline: 2px solid var(--dsw-alias-brand-primary);
	outline-offset: 2px;
}
/* The one-frame acknowledgement before the conversation takes over: the
 * square is already drawn as current, so only the press needs saying. */
.tb-cell.is-opening {
	transform: scale(0.94);
	filter: brightness(0.9);
}
.tb-cell.is-pinned::before {
	content: "";
	position: absolute;
	top: 3px;
	right: 3px;
	width: 4px;
	height: 4px;
	border-radius: 50%;
	background: var(--dsw-alias-brand-primary);
}
.tb-cell.is-add {
	background: transparent;
	box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3);
}
.tb-cell.is-add::after {
	content: "+";
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 14px;
	line-height: 1;
	color: var(--dsw-alias-label-secondary);
	opacity: 0;
	transition: opacity 0.12s ease;
}
.tb-cell.is-add:hover::after {
	opacity: 0.85;
}
.tb-cell-glyph {
	position: absolute;
	inset: 0;
	color: var(--dsw-alias-label-primary);
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0.42;
	pointer-events: none;
	transition: opacity 0.12s ease;
}
.tb-cell-glyph svg {
	display: block;
	width: 46%;
	height: 46%;
	max-width: 52px;
	max-height: 52px;
}
.tb-cell:hover .tb-cell-glyph,
.tb-cell:focus-visible .tb-cell-glyph {
	opacity: 0.9;
}
/* A picked face covers the whole square and lets the status colour read
 * through it, so the matrix never loses the layer it belongs to.
 *
 * The luminosity blend is the reason a picked picture is stored grey: the
 * face supplies light and shade only, and the square below keeps supplying
 * the hue. A running Workspace therefore glows blue with its icon inside it,
 * a finished one green, which is how a lit panel behaves. */
.tb-cell-face {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: var(--tb-face-opacity, 0.55);
	mix-blend-mode: luminosity;
	pointer-events: none;
	transition: opacity 0.12s ease;
}
.tb-cell-face.is-image {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.tb-cell-face.is-emoji {
	font-size: calc(var(--tb-cell, 32px) * 0.62);
	font-family: "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
	line-height: 1;
	/* Emoji arrive as colour bitmaps, so they have to be stripped here rather
	 * than at pick time: the stored value stays one short character. The
	 * contrast lift puts back the shading a flat glyph loses once it is
	 * reduced to light and dark. */
	filter: grayscale(1) contrast(2.2);
}
.tb-cell:hover .tb-cell-face {
	opacity: calc(var(--tb-face-opacity, 0.55) * 1.5);
}
.tb-hint {
	position: fixed;
	z-index: 70;
	max-width: 240px;
	padding: 6px 9px;
	border-radius: var(--dsw-radius-lg, 8px);
	background: var(--dsw-alias-bg-layer-1);
	box-shadow: var(--dsw-elevation-panel);
	color: var(--dsw-alias-label-primary);
	pointer-events: none;
	font-size: 12px;
	line-height: 16px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	animation: tb-preview-enter .12s ease-out;
}
.tb-cell.is-dim {
	opacity: 0.14;
	pointer-events: none;
}
.tb-cell.is-drag {
	opacity: 0.3;
}
.tb-cell.is-drop {
	outline: 2px dashed var(--dsw-alias-brand-primary);
	outline-offset: 1px;
}
.tb-empty-state {
	margin: 40px auto;
	text-align: center;
	color: var(--dsw-alias-label-secondary);
	font-size: 13px;
	line-height: 1.7;
}
.tb-empty-title {
	margin-bottom: 4px;
	font-size: 15px;
	color: var(--dsw-alias-label-primary);
}
.tb-scrim {
	position: fixed;
	inset: 0;
	z-index: 60;
}
.tb-menu {
	position: fixed;
	z-index: 61;
	min-width: 172px;
	padding: 4px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 8px;
	background: var(--dsw-alias-bg-layer-2);
	box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
}
.tb-menu-item {
	display: block;
	width: 100%;
	padding: 6px 10px;
	border: 0;
	border-radius: 5px;
	background: transparent;
	color: var(--dsw-alias-label-primary);
	font: inherit;
	font-size: 13px;
	text-align: left;
	cursor: pointer;
}
.tb-menu-item:hover {
	background: var(--dsw-alias-bg-layer-1);
}
/* Deleting a Workspace is the one irreversible-looking entry in the menu;
 * it reads as a warning even before the confirmation dialog opens. */
.tb-menu-item.is-danger {
	color: var(--dsw-alias-state-error-primary, #c0392b);
}
.tb-menu-sep {
	height: 1px;
	margin: 4px 6px;
	background: var(--dsw-alias-border-l1);
}
.tb-dialog {
	position: fixed;
	z-index: 61;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: min(360px, calc(100vw - 48px));
	padding: 16px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 10px;
	background: var(--dsw-alias-bg-layer-2);
	box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
}
.tb-dialog-title {
	margin-bottom: 2px;
	font-size: 14px;
	font-weight: 600;
	color: var(--dsw-alias-label-primary);
}
.tb-icon-sub {
	margin-bottom: 10px;
	font-size: 12px;
	color: var(--dsw-alias-label-secondary);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.tb-icon-dialog {
	width: min(420px, calc(100vw - 48px));
}
.tb-icon-hint {
	margin-bottom: 10px;
	font-size: 11px;
	line-height: 1.5;
	color: var(--dsw-alias-label-caption);
}
.tb-icon-grid {
	display: grid;
	grid-template-columns: repeat(8, 1fr);
	gap: 4px;
	margin-bottom: 14px;
}
.tb-icon-pick {
	display: flex;
	align-items: center;
	justify-content: center;
	aspect-ratio: 1;
	padding: 0;
	border: 1px solid transparent;
	border-radius: 6px;
	background: var(--dsw-alias-bg-layer-1);
	font-size: 18px;
	line-height: 1;
	cursor: pointer;
}
.tb-icon-pick:hover {
	border-color: var(--dsw-alias-border-l2);
}
.tb-icon-pick.is-on {
	border-color: var(--dsw-alias-brand-primary);
}
.tb-icon-actions {
	display: flex;
	gap: 8px;
	align-items: center;
}
.tb-icon-file {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
	pointer-events: none;
}
.tb-icon-error {
	margin-top: 10px;
	font-size: 12px;
	color: var(--dsw-alias-state-danger-primary, #e5484d);
}
.tb-dialog-text {
	margin-bottom: 12px;
	font-size: 13px;
	line-height: 1.6;
	color: var(--dsw-alias-label-primary);
}
.tb-dialog-input {
	box-sizing: border-box;
	width: 100%;
	height: 30px;
	padding: 0 10px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 6px;
	background: var(--dsw-alias-bg-layer-1);
	color: var(--dsw-alias-label-primary);
	font: inherit;
	font-size: 13px;
	outline: none;
}
.tb-dialog-input:focus {
	border-color: var(--dsw-alias-brand-primary);
}
.tb-dialog-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 16px;
}
.tb-btn {
	min-width: 64px;
	height: 28px;
	padding: 0 12px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 6px;
	background: transparent;
	color: var(--dsw-alias-label-primary);
	font: inherit;
	font-size: 13px;
	cursor: pointer;
}
.tb-btn:hover {
	background: var(--dsw-alias-bg-layer-1);
}
.tb-btn.is-primary {
	border-color: transparent;
	background: var(--dsw-alias-brand-primary);
	color: #fff;
}
.tb-btn.is-danger {
	border-color: transparent;
	background: var(--dsw-alias-state-error-primary);
	color: #fff;
}
.tb-back {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	height: 26px;
	margin-right: 4px;
	padding: 0 8px;
	border: 1px solid var(--dsw-alias-border-l1);
	border-radius: 6px;
	background: transparent;
	color: var(--dsw-alias-label-secondary);
	font: inherit;
	font-size: 12px;
	cursor: pointer;
}
.tb-back:hover {
	border-color: var(--dsw-alias-border-l2);
	color: var(--dsw-alias-label-primary);
}
.tb-back-glyph {
	font-size: 12px;
	line-height: 1;
	letter-spacing: 1px;
}
.tb-rods-shell {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
}
.tb-rods {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
	padding: 6px 0;
	overflow-x: hidden;
	overflow-y: auto;
	scrollbar-width: none;
	overscroll-behavior: contain;
}
.tb-rods::-webkit-scrollbar {
	display: none;
}
.tb-rods.is-fade-top {
	mask-image: linear-gradient(#0000 0, #000 24px 100%);
}
.tb-rods.is-fade-bottom {
	mask-image: linear-gradient(#000 0 calc(100% - 24px), #0000 100%);
}
.tb-rods.is-fade-top.is-fade-bottom {
	mask-image: linear-gradient(#0000 0, #000 24px calc(100% - 24px), #0000 100%);
}
.tb-rod {
	position: relative;
	display: block;
	flex: none;
	width: 100%;
	height: 12px;
	padding: 0;
	border: 0;
	background: none;
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.tb-rod:focus-visible {
	outline: none;
}
/* Same mechanism as the Turn navigator: the bar is drawn at full length and
 * shortened with scaleX from the left edge, so growing it on hover costs no
 * layout. Resting 0.6 of 120px reads as 72px, hover and the active rod reach
 * the full 120px. */
.tb-rod-bar {
	position: absolute;
	top: 50%;
	left: 8px;
	display: flex;
	width: 120px;
	height: 4px;
	border-radius: 2px;
	background: var(--dsw-alias-border-l4);
	overflow: hidden;
	transform: translateY(-50%) scaleX(0.6);
	transform-origin: 0 50%;
	transition: transform .14s, background-color .14s;
}
.tb-rod:hover .tb-rod-bar,
.tb-rod:focus-visible .tb-rod-bar {
	transform: translateY(-50%) scaleX(1);
}
.tb-rod.is-current .tb-rod-bar,
.tb-rod.is-entered .tb-rod-bar {
	transform: translateY(-50%) scaleX(1);
}
.tb-rod:hover .tb-seg.is-idle,
.tb-rod:focus-visible .tb-seg.is-idle {
	background: var(--dsw-alias-label-tertiary);
}
.tb-rod:focus-visible .tb-rod-bar {
	outline: 1px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
	outline-offset: 1px;
}
.tb-seg {
	flex: 1 1 0;
	min-width: 1px;
}
.tb-seg.is-run {
	background: var(--dsw-alias-state-business-primary, #4176e6);
	animation: tb-breathe 1s ease-in-out infinite;
}
.tb-seg.is-wait {
	background: var(--dsw-alias-state-warn-primary);
	animation: tb-breathe 1s ease-in-out infinite;
}
.tb-seg.is-done {
	background: var(--dsw-alias-state-success-primary);
}
.tb-seg.is-idle {
	background: var(--dsw-alias-border-l4);
}
.tb-seg.is-none {
	background: var(--dsw-alias-border-l4);
}
.tb-rod.is-current .tb-seg.is-idle,
.tb-rod.is-entered .tb-seg.is-idle {
	background: var(--dsw-alias-label-primary);
}
.tb-preview {
	position: fixed;
	z-index: 70;
	box-sizing: border-box;
	max-width: 260px;
	padding: 8px 10px;
	border-radius: var(--dsw-radius-lg, 8px);
	background: var(--dsw-alias-bg-layer-1);
	box-shadow: var(--dsw-elevation-panel);
	color: var(--dsw-alias-label-primary);
	pointer-events: none;
	animation: tb-preview-enter .12s ease-out;
}
.tb-preview-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font: var(--dsw-font-xs-strong-13, 13px/18px inherit);
}
.tb-preview-meta {
	margin-top: 2px;
	color: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary));
	font: var(--dsw-font-xxs-12, 12px/16px inherit);
}
@keyframes tb-preview-enter {
	0% { opacity: 0; transform: translate(4px); }
	100% { opacity: 1; transform: translate(0); }
}
.tb-rail {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding: 6px 0;
}
.tb-rail-empty {
	font-size: 10px;
	color: var(--dsw-alias-label-secondary);
}
@keyframes tb-breathe {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.35; }
}
@keyframes tb-cell-breathe {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
	.tb-cell.is-run, .tb-seg.is-run { animation: none; }
	.tb-cell { transition: none; }
}
`;

		/**
		 * Append the static sheet once for the plugin's lifetime.
		 * @param {object} ctx - client plugin context.
		 */
		function installStyles(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.pluginCss = STYLE_ID;
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "gridGui: stylesheet");
		}

		/* ------------------------------------------------------------------ *
		 * Popup pieces
		 * ------------------------------------------------------------------ */

		/**
		 * @param {object} menu - `{ x, y, block, sessionId, scope }`.
		 * @param {object} api - injected actions.
		 * @param {Function} t - translate.
		 * @param {object} control - pinned flag plus close/open/dialog callbacks.
		 * @returns {object} the popup element tree.
		 */
		function renderMenu(menu, api, t, control) {
			const block = menu.block;
			const items = [];
			/* `scope` says which layer opened the menu, and it — not the
			 * presence of a Session id — decides what may appear. The two
			 * layers act on different things: a Session square never offers
			 * Workspace operations, so deleting a Workspace can only ever be
			 * reached from the layer that shows Workspaces. */
			const workspaceScope = menu.scope === "workspace";
			if (workspaceScope) {
				items.push(
					h(
						"button",
						{
							key: "new",
							type: "button",
							className: "tb-menu-item",
							onClick: () => {
								control.onClose();
								if (block.workspaceId !== undefined) control.onNewSession(block.workspaceId);
							},
						},
						t("board.newSession"),
					),
				);
			} else {
				items.push(
					h(
						"button",
						{
							key: "open",
							type: "button",
							className: "tb-menu-item",
							onClick: () => control.onOpen(menu.sessionId),
						},
						t("board.open"),
					),
					h(
						"button",
						{
							key: "pin",
							type: "button",
							className: "tb-menu-item",
							onClick: () => {
								control.onClose();
								if (control.pinned) api.unpin(menu.sessionId);
								else api.pin(menu.sessionId);
							},
						},
						control.pinned ? t("board.unpinSession") : t("board.pinSession"),
					),
					h(
						"button",
						{
							key: "archive",
							type: "button",
							className: "tb-menu-item",
							onClick: () => {
								control.onClose();
								api.archive(menu.sessionId);
							},
						},
						t("board.archiveSession"),
					),
				);
			}
			items.push(h("div", { key: "sep", className: "tb-menu-sep" }));
			items.push(
				h(
					"button",
					{
						key: "icon",
						type: "button",
						className: "tb-menu-item",
						onClick: () =>
							control.onDialog({
								kind: "icon",
								block,
								key: menu.sessionId === null ? "w:" + String(block.workspaceId) : "s:" + menu.sessionId,
								title: menu.title,
							}),
					},
					t("board.changeIcon"),
				),
			);
			/* Rename and delete act on the Workspace, so they belong to the
			 * Workspace layer only. Offering them on a Session square — the
			 * layer where the reader is aiming at one Session — puts a
			 * destructive Workspace action one slip away from a Session
			 * action, so the Session layer simply does not carry them. */
			if (workspaceScope) {
				items.push(
					h(
						"button",
						{
							key: "rename",
							type: "button",
							className: "tb-menu-item",
							onClick: () => control.onDialog({ kind: "rename", block, value: block.title }),
						},
						t("board.renameWorkspace"),
					),
				);
				items.push(
					h(
						"button",
						{
							key: "delete",
							type: "button",
							className: "tb-menu-item is-danger",
							onClick: () => control.onDialog({ kind: "delete", block }),
						},
						t("board.deleteWorkspace"),
					),
				);
			}
			return h(
				Fragment,
				null,
				h("div", { className: "tb-scrim", onClick: control.onClose, onContextMenu: (event) => event.preventDefault() }),
				h(
					"div",
					{ className: "tb-menu", style: { left: menu.x, top: menu.y } },
					items,
				),
			);
		}

		/**
		 * The icon picker: a pool of emoji, one file input, and a reset. A
		 * picked picture is shrunk here before it is ever stored, so the
		 * original file never leaves the browser.
		 *
		 * @param {object} dialog - `{ kind, block, key, title }`.
		 * @param {Function} t - translate.
		 * @param {Function} close - close the dialog.
		 * @returns {object} the picker element tree.
		 */
		function IconDialog(props) {
			const { dialog, t, close } = props;
			const [busy, setBusy] = useState(false);
			const [error, setError] = useState(null);
			const current = iconOf(dialog.key);
			const finish = () => close(null);
			const pick = (icon) => {
				storeIcon(dialog.key, icon);
				finish();
			};
			const onFile = async (event) => {
				const file = event.target.files === null ? undefined : event.target.files[0];
				if (file === undefined) return;
				setBusy(true);
				setError(null);
				try {
					const data = await shrinkImage(file);
					pick({ kind: "image", value: data });
				} catch (failure) {
					setBusy(false);
					setError(failure instanceof Error ? failure.message : String(failure));
				}
			};
			return h(
				Fragment,
				null,
				h("div", { className: "tb-scrim", onClick: finish }),
				h(
					"div",
					{ className: "tb-dialog tb-icon-dialog", role: "dialog", "aria-modal": true },
					h("div", { className: "tb-dialog-title" }, t("board.iconTitle")),
					h("div", { className: "tb-icon-sub" }, dialog.title),
					h("div", { className: "tb-icon-hint" }, t("board.iconHint")),
					h(
						"div",
						{ className: "tb-icon-grid" },
						ICON_EMOJI.map((emoji) =>
							h(
								"button",
								{
									key: emoji,
									type: "button",
									className:
										"tb-icon-pick" +
										(current !== undefined && current.kind === "emoji" && current.value === emoji
											? " is-on"
											: ""),
									onClick: () => pick({ kind: "emoji", value: emoji }),
								},
								emoji,
							),
						),
					),
					h(
						"div",
						{ className: "tb-icon-actions" },
						h(
							"label",
							{ className: "tb-btn is-primary" },
							busy ? t("board.iconWorking") : t("board.iconUpload"),
							h("input", {
								className: "tb-icon-file",
								type: "file",
								accept: "image/*",
								onChange: onFile,
							}),
						),
						h(
							"button",
							{
								type: "button",
								className: "tb-btn",
								onClick: () => pick(null),
							},
							t("board.iconReset"),
						),
					),
					error === null ? null : h("div", { className: "tb-icon-error" }, error),
				),
			);
		}

		/**
		 * @param {object} dialog - `{ kind, block, value? }`.
		 * @param {object} api - injected actions.
		 * @param {Function} t - translate.
		 * @param {Function} close - close the dialog.
		 * @returns {object} the modal element tree.
		 */
		function renderDialog(dialog, api, t, close) {
			const block = dialog.block;
			const finish = () => close(null);
			if (dialog.kind === "icon") return h(IconDialog, { key: "icon", dialog, t, close });
			const body =
				dialog.kind === "delete"
					? h(
							"div",
							{ className: "tb-dialog-text" },
							t("board.deleteText", { title: block.title }),
						)
					: h("input", {
							className: "tb-dialog-input",
							type: "text",
							value: dialog.value,
							autoFocus: true,
							onChange: (event) => close({ ...dialog, value: event.target.value }),
							onKeyDown: (event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								if (dialog.value.trim() !== "") api.rename(block.workspaceId, dialog.value.trim());
								finish();
							},
						});
			return h(
				Fragment,
				null,
				h("div", { className: "tb-scrim", onClick: finish }),
				h(
					"div",
					{ className: "tb-dialog", role: "dialog", "aria-modal": true },
					body,
					h(
						"div",
						{ className: "tb-dialog-actions" },
						h("button", { type: "button", className: "tb-btn", onClick: finish }, t("board.cancel")),
						h(
							"button",
							{
								type: "button",
								className: "tb-btn " + (dialog.kind === "delete" ? "is-danger" : "is-primary"),
								onClick: () => {
									if (dialog.kind === "delete") {
										if (block.workspaceId !== undefined) api.remove(block.workspaceId);
										if (currentView() === block.key) setView(null);
									} else if (dialog.value.trim() !== "") {
										api.rename(block.workspaceId, dialog.value.trim());
									}
									finish();
								},
							},
							dialog.kind === "delete" ? t("board.delete") : t("board.confirm"),
						),
					),
				),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Board panel
		 * ------------------------------------------------------------------ */

		/**
		 * The two layers in one panel. Layer one is one square per
		 * Workspace; clicking a square enters that Workspace and the same grid
		 * becomes its Sessions. Search never reflows either layer — it only
		 * drops contrast on the squares that do not match.
		 *
		 * @param {object} props - standard hook seats, `t`, and the injected api.
		 * @returns {object} the board element tree.
		 */
		function BoardPanel(props) {
			const { useWorkspaces, useSessions, useSessionStatus, t, api } = props;
			const snapshot = useWorkspaces((state) => state);
			const list = useSessions((state) => state);
			const statuses = useSessionStatus((state) => state);
			useIcons();

			const [entered, setEntered] = useState(currentView());
			const [query, setQuery] = useState("");
			const [menu, setMenu] = useState(null);
			const [dialog, setDialog] = useState(null);
			const [dragging, setDragging] = useState(null);
			const [dropping, setDropping] = useState(null);
			const [cellSize, setCellSize] = useState(CELL_MIN);
			const [hint, setHint] = useState(null);
			const viewportRef = useRef(null);
			const drag = useRef(null);
			const drop = useRef(null);

			useEffect(() => {
				view.listeners.add(setEntered);
				setEntered(view.key);
				return () => {
					view.listeners.delete(setEntered);
				};
			}, []);

			useEffect(() => {
				setQuery("");
				setMenu(null);
				setDialog(null);
				setHint(null);
			}, [entered]);

			const blocks = useMemo(
				() => buildBlocks(snapshot, list, t("board.ungrouped")),
				[snapshot, list, t],
			);
			const totalSessions = useMemo(
				() => blocks.reduce((sum, block) => sum + block.sessionIds.length, 0),
				[blocks],
			);
			const room = useMemo(
				() => blocks.find((block) => block.key === entered) ?? null,
				[blocks, entered],
			);

			/* A Workspace that vanishes (deleted elsewhere, or a stale stored
			 * key after a reload) drops the reader back on the grid. */
			useEffect(() => {
				if (entered !== null && room === null) setView(null);
			}, [entered, room]);

			/* Opening a Session is the one click that has to feel instant, and
			 * the shipped conversation view costs a long task to mount. So the
			 * square answers on the very next frame: it turns into the current
			 * square, and the board dims in the same frame, before the click
			 * handler hands over to the conversation. Without this the reader
			 * stares at an unchanged grid for the length of that mount. */
			const [opening, setOpening] = useState(null);
			useEffect(() => {
				if (opening === null) return undefined;
				const timer = setTimeout(() => setOpening(null), 900);
				return () => clearTimeout(timer);
			}, [opening]);

			const needle = query.trim().toLowerCase();
			const pinned = new Set(snapshot.pinnedSessionIds ?? []);

			const closeMenu = useCallback(() => setMenu(null), []);

			/* Starting a Session from the grid does leave the grid: the shipped
			 * Session view only shows a blank Session while it is the current
			 * one (`sessionVisible` drops every other blank), so a blank left
			 * behind on the board would be an invisible orphan that piles up in
			 * the store. `openWorkspace` creates the blank and opens it in one
			 * step, which is exactly the one behaviour the store supports — the
			 * label and the hover hint say so instead of hiding it. */
			const startSession = useCallback(
				(workspaceId) => {
					if (workspaceId === undefined) return;
					api.startBlank(workspaceId);
				},
				[api],
			);

			const onOpen = useCallback(
				(sessionId) => {
					closeMenu();
					/* Paint the acknowledgement first, then hand over: the
					 * state update is committed on the next frame, and the
					 * conversation mount runs after it, so the reader sees the
					 * square react instead of a frozen grid. */
					setOpening(sessionId);
					requestAnimationFrame(() => {
						api.openSession(sessionId);
					});
				},
				[api, closeMenu],
			);

			const openMenu = useCallback((event, block, sessionId, title, scope) => {
				event.preventDefault();
				if (block.workspaceId === undefined) return;
				setMenu({
					x: Math.min(event.clientX, window.innerWidth - 190),
					y: Math.min(event.clientY, window.innerHeight - 250),
					block,
					sessionId,
					title: title === undefined ? block.title : title,
					/* The scope comes from the call site, never from the shape of
					 * `sessionId`: the add square sits on the Session layer but
					 * carries no Session, and inferring from the id alone handed
					 * it the Workspace menu — including Delete Workspace. */
					scope: scope === undefined ? "workspace" : scope,
				});
			}, []);

			const beginDrag = useCallback((event, block, sessionId) => {
				if (!event.ctrlKey || event.button !== 0) return;
				event.preventDefault();
				const next = { sessionId, workspaceId: block.workspaceId };
				drag.current = next;
				drop.current = null;
				setDragging(next);
				setDropping(null);
			}, []);

			const onPointerMove = useCallback((event) => {
				if (drag.current === null) return;
				const node = document.elementFromPoint(event.clientX, event.clientY);
				const cell = node === null ? null : node.closest("[data-sid]");
				const sid = cell === null ? "" : cell.getAttribute("data-sid");
				const key = cell === null ? "" : cell.getAttribute("data-key");
				const next =
					sid !== "" && sid !== drag.current.sessionId && key === drag.current.workspaceId ? sid : null;
				drop.current = next;
				setDropping(next);
			}, []);

			const endDrag = useCallback(() => {
				if (drag.current !== null && drop.current !== null) {
					api.reorder(drag.current.workspaceId, drag.current.sessionId, drop.current);
				}
				drag.current = null;
				drop.current = null;
				setDragging(null);
				setDropping(null);
			}, [api]);

			useEffect(() => {
				if (dragging === null) return undefined;
				const escape = (event) => {
					if (event.key !== "Escape") return;
					drag.current = null;
					drop.current = null;
					setDragging(null);
					setDropping(null);
				};
				window.addEventListener("keydown", escape);
				return () => window.removeEventListener("keydown", escape);
			}, [dragging]);

			useEffect(() => {
				if (menu === null && dialog === null) return undefined;
				const escape = (event) => {
					if (event.key !== "Escape") return;
					setMenu(null);
					setDialog(null);
				};
				window.addEventListener("keydown", escape);
				return () => window.removeEventListener("keydown", escape);
			}, [menu, dialog]);

			/* ---------------- layer one: one square per Workspace ---------------- */

			const workspaceCells = [];
			if (entered === null) {
				for (const block of blocks) {
					const hit =
						needle === "" ||
						block.title.toLowerCase().includes(needle) ||
						block.sessionIds.some((id) => sessionTitle(list, id).toLowerCase().includes(needle));
					let className = "tb-cell" + statusCombo(statusMix(statuses, block.sessionIds));
					if (blockIsCurrent(list, block.sessionIds)) className += " is-current";
					if (!hit) className += " is-dim";
					workspaceCells.push(
						h(
							"button",
							{
								key: block.key,
								type: "button",
								className,
								title: block.title + " · " + String(block.sessionIds.length) + " " + t("board.sessUnit"),
								"aria-label": t("board.enter") + " · " + block.title,
								"data-wskey": block.key,
								onPointerEnter: (event) => {
									const rect = event.currentTarget.getBoundingClientRect();
									setHint({
										text: block.title + " · " + String(block.sessionIds.length) + " " + t("board.sessUnit"),
										top: rect.bottom + 6,
										left: rect.left,
									});
								},
								onPointerLeave: () => setHint(null),
								onClick: () => setView(block.key),
								onContextMenu: (event) => openMenu(event, block, null, undefined, "workspace"),
							},
							renderFace("w:" + String(block.workspaceId ?? block.key), block.title),
						),
					);
				}
			}

			/* ---------------- layer two: one square per Session ---------------- */

			const sessionCells = [];
			if (entered !== null && room !== null) {
				for (const sessionId of room.sessionIds) {
					const state = statusOf(statuses, sessionId);
					const title = sessionTitle(list, sessionId);
					const hit = needle === "" || title.toLowerCase().includes(needle);
					let className = "tb-cell";
					if (state !== "idle") className += " is-" + state;
					if (isCurrent(list, sessionId)) className += " is-current";
					if (opening === sessionId) className += " is-current is-opening";
					if (!hit) className += " is-dim";
					if (pinned.has(sessionId)) className += " is-pinned";
					if (dragging !== null && dragging.sessionId === sessionId) className += " is-drag";
					if (dropping === sessionId) className += " is-drop";
					sessionCells.push(
						h(
							"button",
							{
								key: sessionId,
								type: "button",
								className,
								title,
								"aria-label": title,
								"data-sid": sessionId,
								"data-key": room.workspaceId ?? "",
								onPointerEnter: (event) => {
									const rect = event.currentTarget.getBoundingClientRect();
									setHint({ text: title, top: rect.bottom + 6, left: rect.left });
								},
								onPointerLeave: () => setHint(null),
								onClick: () => onOpen(sessionId),
								onContextMenu: (event) => openMenu(event, room, sessionId, title, "session"),
								onPointerDown: (event) => beginDrag(event, room, sessionId),
							},
							renderFace("s:" + sessionId, title),
						),
					);
				}
				if (room.workspaceId !== undefined) {
					sessionCells.push(
						h("button", {
							key: "\u0000add",
							type: "button",
							className: "tb-cell is-add" + (needle !== "" ? " is-dim" : ""),
							title: t("board.newSessionHint"),
							"aria-label": t("board.newSession") + " · " + room.title,
							onClick: () => startSession(room.workspaceId),
							/* The add square carries no Session, so there is
							 * nothing to act on here; it must never fall back to
							 * the Workspace menu. */
							onContextMenu: (event) => event.preventDefault(),
						}),
					);
				}
			}

			const menuNode =
				menu === null
					? null
					: renderMenu(menu, api, t, {
							pinned: menu.sessionId === null ? false : pinned.has(menu.sessionId),
							onClose: closeMenu,
							onOpen,
							onNewSession: startSession,
							onDialog: (next) => {
								closeMenu();
								setDialog(next);
							},
						});

			const dialogNode = dialog === null ? null : renderDialog(dialog, api, t, setDialog);

			/* The bar keeps one fixed read-out. Naming squares on hover happens
			 * inside the square itself, so nothing jumps around up here. */
			const legend =
				entered === null
					? String(blocks.length) + " " + t("board.wsUnit") + " · " + String(totalSessions) + " " + t("board.sessUnit")
					: String(room === null ? 0 : room.sessionIds.length) + " " + t("board.sessUnit");

			const empty = entered === null ? workspaceCells.length === 0 : sessionCells.length === 0;
			const layerCount = entered === null ? workspaceCells.length : sessionCells.length;

			/* Grow the squares until they fill the space the main area gives
			 * us — the point of looking at a Workspace matrix is that it reads
			 * as one body, not as a postage stamp in a corner. The edge is
			 * capped, so a Workspace with one Session stays a square rather
			 * than becoming the whole page, and the grid stays centred. */
			const columns = squareColumns(layerCount);
			const rows = layerCount === 0 ? 0 : Math.ceil(layerCount / columns);
			useEffect(() => {
				const node = viewportRef.current;
				if (node === null || layerCount === 0) return;
				const measure = () => {
					const style = getComputedStyle(node);
					const width = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
					const height = node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
					const byWidth = (width - GUTTER * (columns - 1)) / columns;
					const byHeight = (height - GUTTER * (rows - 1)) / rows;
					const edge = Math.floor(Math.min(byWidth, byHeight));
					setCellSize(Math.max(CELL_MIN, Math.min(CELL_MAX, edge)));
				};
				measure();
				const observer = new ResizeObserver(measure);
				observer.observe(node);
				return () => {
					observer.disconnect();
				};
			}, [columns, rows, layerCount]);

			return h(
				"div",
				{ className: "tb-board" },
				h(
					"div",
					{ className: "tb-bar" },
					entered === null
						? null
						: h(
								"button",
								{
									type: "button",
									className: "tb-crumb",
									title: t("board.backHint"),
									"aria-label": t("board.backHint"),
									onClick: () => setView(null),
								},
								h("span", { className: "tb-crumb-glyph", "aria-hidden": true }, "\u25c0"),
								h("span", null, t("board.back")),
							),
					entered === null ? null : h("span", { className: "tb-title" }, room === null ? "" : room.title),
					h("input", {
						className: "tb-search",
						type: "search",
						value: query,
						placeholder: entered === null ? t("board.search") : t("board.searchSession"),
						"aria-label": entered === null ? t("board.search") : t("board.searchSession"),
						onChange: (event) => setQuery(event.target.value),
					}),
					h(
						"span",
						{ className: "tb-legend", title: entered === null ? t("board.rodHint") : t("board.reorderHint") },
						legend,
					),
				),
				h(
					"div",
					{ ref: viewportRef, className: "tb-viewport" },
					empty
						? h(
								"div",
								{ className: "tb-empty-state" },
								h("div", { className: "tb-empty-title" }, entered === null ? t("board.empty") : t("board.emptyRoom")),
								h("div", null, entered === null ? t("board.emptyHint") : t("board.emptyRoomHint")),
							)
						: h(
								"div",
								{
									className: "tb-grid",
									style: {
										"--tb-cols": String(columns),
										"--tb-cell": String(cellSize) + "px",
									},
									onPointerMove,
								},
								entered === null ? workspaceCells : sessionCells,
							),
				),
				hint === null
					? null
					: (() => {
							const width = Math.min(240, 12 + hint.text.length * 7);
							const left = Math.max(8, Math.min(hint.left, window.innerWidth - width - 8));
							const top = Math.min(hint.top, window.innerHeight - 34);
							return h("div", { className: "tb-hint", style: { top: top + "px", left: left + "px" } }, hint.text);
						})(),
				menuNode,
				dialogNode,
			);
		}

		/* ------------------------------------------------------------------ *
		 * Sidebar rods
		 * ------------------------------------------------------------------ */

		/**
		 * One rod per Workspace, borrowed wholesale from the shipped
		 * Turn navigator: a fixed-pitch rail of 10px hit areas, each drawing a
		 * 2px bar, scrolling without a scrollbar and fading at both ends, and
		 * naming itself only through a hover preview. The bar keeps one length
		 * for every Workspace; only its colour bands vary, one band per status
		 * sized by that status's share of the Workspace's own Sessions, widest
		 * band first. Clicking a rod enters that Workspace on the board.
		 *
		 * @param {object} props - standard hook seats, `t`, `wide`, and the api.
		 * @returns {object} the sidebar region element tree.
		 */
		function RodList(props) {
			const { wide, useWorkspaces, useSessions, useSessionStatus, t, api } = props;
			const snapshot = useWorkspaces((state) => state);
			const list = useSessions((state) => state);
			const statuses = useSessionStatus((state) => state);

			const [entered, setEntered] = useState(currentView());
			const [preview, setPreview] = useState(null);
			const [fade, setFade] = useState({ top: false, bottom: false });
			const scrollerRef = useRef(null);

			useEffect(() => {
				view.listeners.add(setEntered);
				setEntered(view.key);
				return () => {
					view.listeners.delete(setEntered);
				};
			}, []);

			const blocks = useMemo(
				() => buildBlocks(snapshot, list, t("board.ungrouped")),
				[snapshot, list, t],
			);

			const readFade = useCallback(() => {
				const node = scrollerRef.current;
				if (node === null) return;
				setFade({
					top: node.scrollTop > 2,
					bottom: node.scrollTop + node.clientHeight < node.scrollHeight - 2,
				});
			}, []);

			useEffect(() => {
				readFade();
			}, [readFade, blocks.length]);

			/* Keep the Workspace that holds the open Session in view, the way
			 * the Turn navigator keeps the active turn centred. */
			const activeKey = blocks.find((block) => blockIsCurrent(list, block.sessionIds))?.key ?? entered;
			useEffect(() => {
				const node = scrollerRef.current;
				if (node === null || activeKey === null) return;
				const index = blocks.findIndex((block) => block.key === activeKey);
				const marker = node.children[index];
				if (index < 0 || marker === undefined) return;
				const top = marker.offsetTop - (node.clientHeight - marker.offsetHeight) / 2;
				node.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
			}, [activeKey, blocks]);

			/* A collapsed sidebar shows nothing from this plugin: the rail
			 * glyph would only repeat the shipped collapse toggle. */
			if (!wide) return null;

			if (blocks.length === 0) {
				return h("div", { className: "tb-rail" }, h("span", { className: "tb-rail-empty" }, t("board.rodsEmpty")));
			}

			/* Fixed bars: a Workspace's own Sessions divide the whole length
			 * among their statuses, so the bands always sum to 100%. */
			const rods = blocks.map((block) => {
				const count = block.sessionIds.length;
				const mix = statusMix(statuses, block.sessionIds);
				const classes = ["tb-rod"];
				if (blockIsCurrent(list, block.sessionIds)) classes.push("is-current");
				if (block.key === entered) classes.push("is-entered");
				const bands = STATUS_ORDER.map((key) => ({ key, n: mix[key] }))
					.filter((band) => band.n > 0)
					.sort((a, b) => b.n - a.n)
					.map((band) =>
						h("span", { key: band.key, className: "tb-seg is-" + band.key, style: { flexGrow: band.n, flexBasis: 0 } }),
					);
				if (bands.length === 0) {
					bands.push(h("span", { key: "none", className: "tb-seg is-none", style: { flexGrow: 1, flexBasis: 0 } }));
				}
				const showPreview = (node) => {
					const rect = node.getBoundingClientRect();
					setPreview({
						title: block.title,
						meta: String(count) + " " + t("board.sessUnit"),
						top: Math.round(rect.top + rect.height / 2 - 22),
						left: Math.round(rect.left + ROD_INSET + ROD_BAR + 12),
					});
				};
				return h(
					"button",
					{
						key: block.key,
						type: "button",
						className: classes.join(" "),
						title: block.title,
						"aria-label": t("board.enter") + " \u00b7 " + block.title,
						onPointerMove: (event) => {
							showPreview(event.currentTarget);
						},
						onPointerLeave: () => {
							setPreview(null);
						},
						onFocus: (event) => {
							showPreview(event.currentTarget);
						},
						onBlur: () => {
							setPreview(null);
						},
						onClick: () => {
							setPreview(null);
							setView(block.key);
							api.back();
						},
					},
					h("span", { className: "tb-rod-bar" }, bands),
				);
			});

			const fadeClasses = ["tb-rods"];
			if (fade.top) fadeClasses.push("is-fade-top");
			if (fade.bottom) fadeClasses.push("is-fade-bottom");

			/* The preview sits beside the scroller, never inside it: the scroller
			 * carries a mask at each scrollable end, and a mask would clip a
			 * floating card. */
			return h(
				"div",
				{ className: "tb-rods-shell" },
				h(
					"div",
					{
						ref: scrollerRef,
						className: fadeClasses.join(" "),
						role: "list",
						title: t("board.rodHint"),
						onScroll: readFade,
					},
					rods,
				),
				preview === null
					? null
					: h(
							"div",
							{
								className: "tb-preview",
								style: { top: preview.top + "px", left: preview.left + "px" },
							},
							h("div", { className: "tb-preview-name" }, preview.title),
							h("div", { className: "tb-preview-meta" }, preview.meta),
						),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Persistent way back
		 * ------------------------------------------------------------------ */

		/**
		 * Small control in the Conversation header that restores the board —
		 * whichever layer it was left on. The seat renders without a Session
		 * too, so the board stays one click away from wherever the reader is.
		 *
		 * @param {object} props - `t` plus the injected api.
		 * @returns {object} the header button.
		 */
		function BoardBack(props) {
			const { t, api } = props;
			return h(
				"button",
				{
					type: "button",
					className: "tb-back",
					title: t("board.backHint"),
					"aria-label": t("board.backHint"),
					onClick: api.back,
				},
				h("span", { className: "tb-back-glyph", "aria-hidden": true }, "\u25a6\u25a6"),
				h("span", null, t("board.back")),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Plugin body
		 * ------------------------------------------------------------------ */

		const inject = ["slots", "locale", "layout", "uiWorkspace", "workspaces", "contextMenus"];

		/**
		 * @param {object} ctx - client plugin context.
		 */
		function apply(ctx) {
			installStyles(ctx);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "gridGui: locale");

			let landed = false;

			const report = (error) => {
				const text = error instanceof Error ? error.message : String(error);
				console.warn("grid-gui:", text);
				try {
					ctx.contextMenus.notify(text, false);
				} catch {
					/* the notice is best effort */
				}
			};
			const guard = (promise) => {
				if (promise !== undefined && promise !== null && typeof promise.catch === "function") promise.catch(report);
			};
			/**
			 * Call a method that may not exist on this runtime's service face.
			 * A missing method is reported once rather than thrown into React's
			 * event handler, where it would unmount the board.
			 *
			 * @param {object} target - service that should expose the method.
			 * @param {string} name - method name.
			 * @param {Array} args - arguments to forward.
			 */
			const call = (target, name, args) => {
				const fn = target === undefined || target === null ? undefined : target[name];
				if (typeof fn !== "function") {
					report(new Error("this Harness build does not expose " + name + "()"));
					return undefined;
				}
				try {
					const result = fn.apply(target, args);
					guard(result);
					return result;
				} catch (error) {
					report(error);
					return undefined;
				}
			};

			/**
			 * Put the board back after an action that DSH answers by clearing the
			 * main area.
			 *
			 * Archiving the Session that is open in the main area runs
			 * `clearMain()`, which calls `selectPanel(null)` — that deselects the
			 * board and drops the reader onto the new-Session page, even though
			 * they were only tidying one square. Re-selecting the board once the
			 * call settles keeps them where they were; when the archived Session
			 * was not the open one, nothing was cleared and this is a no-op.
			 */
			const keepBoard = () => {
				const apply = () => {
					try {
						if (ctx.layout.panelInfo.getSnapshot().activePanelId !== PANEL_ID) {
							ctx.layout.selectPanel(PANEL_ID);
							landed = true;
						}
					} catch {
						/* the layout store may be gone during teardown */
					}
				};
				/* `clearMain` runs inside the archive promise, and the follow-up
				 * `restoreSelection` can replace the main area a moment later, so
				 * claim the board now, on the next frame, and once more after the
				 * dust settles. */
				apply();
				requestAnimationFrame(apply);
				setTimeout(apply, 350);
			};

			/**
			 * Select the board, retrying across a few frames while the layout store
			 * catches up with the freshly registered main panel key.
			 *
			 * @param {number} attempt - retry counter.
			 */
			const land = (attempt) => {
				const tries = attempt === undefined ? 0 : attempt;
				try {
					ctx.layout.selectPanel(PANEL_ID);
					landed = true;
				} catch {
					if (landed || tries >= 90) return;
					requestAnimationFrame(() => land(tries + 1));
				}
			};

			const api = {
				openSession: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
				startBlank: (workspaceId) => call(ctx.uiWorkspace, "openWorkspace", [workspaceId]),
				archive: (sessionId) => {
					const done = call(ctx.uiWorkspace, "archiveSession", [sessionId]);
					if (done !== undefined && typeof done.then === "function") done.then(keepBoard, keepBoard);
					else keepBoard();
				},
				pin: (sessionId) => call(ctx.uiWorkspace, "pinSession", [sessionId]),
				unpin: (sessionId) => call(ctx.uiWorkspace, "unpinSession", [sessionId]),
				reorder: (workspaceId, sessionId, beforeSessionId) =>
					call(ctx.workspaces, "insertSessionBefore", [workspaceId, sessionId, beforeSessionId]),
				rename: (workspaceId, title) => call(ctx.workspaces, "rename", [workspaceId, title]),
				remove: (workspaceId) => call(ctx.workspaces, "delete", [workspaceId]),
				back: () => {
					landed = false;
					land(0);
				},
			};

			const params = () => ({ api });

			const mount = (name, id, Component) => {
				const pending = ctx.slots.inject(name, () =>
					ctx.slots.register({ name, id, order: -1, priority: -1, locale: NS, inject: params }, Component),
				);
				if (pending instanceof Promise) pending.catch(report);
			};

			ctx.slots.inject("main", () => {
				const dispose = ctx.slots.register(
					{ name: "main", key: PANEL_ID, locale: NS, inject: params },
					BoardPanel,
				);
				if (!landed) land(0);
				return dispose;
			});

			mount("sidebar.workspaces", "gridGui.rods", RodList);
			mount("conversation.header.leading", "gridGui.back", BoardBack);
		}

		module.exports = { inject, apply };
		return module.exports;
	},
});
