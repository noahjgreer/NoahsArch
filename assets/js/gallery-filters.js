/**
 * Gallery filter / sort / search bar.
 *
 * Everything here is derived from the artwork JSON at runtime: the facets, the
 * options inside each facet, and their counts. Adding a new artist, a new tag,
 * or an entirely new field (e.g. "character") to artwork.json makes it show up
 * here on the next page load with no change to this file — the only things
 * hard-coded are the fields deliberately kept OUT of the filter bar (urls,
 * title, date) and cosmetic labels/ordering.
 *
 * Structured to port cleanly onto arch-style-lib later: the popover markup
 * mirrors .arch-popover, the option rows mirror .arch-menu__item--check, and
 * positionPopover() below is a local copy of the library's js/popover.js API.
 */
(function (global) {
    "use strict";

    const FILTER_CONFIG = {
        // Fields never offered as a facet: identifiers, media URLs, and values
        // that are continuous rather than categorical.
        excludedFields: [
            "show", "title", "date", "img_url", "preview_avif_url",
            "preview_webp_url", "backup_url", "total_time"
        ],
        // Always searchable by the text box, on top of every facet value.
        searchFields: ["title", "artist", "tags"],
        // Display names for keys that aren't presentable as-is. Any key not
        // listed falls back to Title Case of the key itself.
        fieldLabels: {
            class: "Category",
            capacity: "Detail",
            type: "Framing"
        },
        // Facets render in this order; anything unlisted follows alphabetically,
        // so a brand-new field appears without needing an entry here.
        fieldOrder: [
            "artist", "character", "characters", "tags",
            "class", "medium", "type", "capacity", "background"
        ],
        // A field with fewer distinct values than this isn't worth a facet.
        minOptions: 2,
        // Above this many options, the popover grows its own filter box.
        optionSearchThreshold: 8
    };

    const SORTS = [
        { id: "date-desc", label: "Newest first", compare: (a, b) => dateValue(b) - dateValue(a) },
        { id: "date-asc", label: "Oldest first", compare: (a, b) => dateValue(a) - dateValue(b) },
        { id: "title-asc", label: "Title (A–Z)", compare: (a, b) => text(a.title).localeCompare(text(b.title)) },
        { id: "title-desc", label: "Title (Z–A)", compare: (a, b) => text(b.title).localeCompare(text(a.title)) },
        { id: "artist-asc", label: "Artist (A–Z)", compare: (a, b) => text(a.artist).localeCompare(text(b.artist)) || dateValue(b) - dateValue(a) },
        { id: "time-desc", label: "Longest to make", compare: (a, b) => timeValue(b) - timeValue(a) },
        { id: "time-asc", label: "Quickest to make", compare: (a, b) => timeValue(a) - timeValue(b) }
    ];

    const DEFAULT_SORT = "date-desc";

    // ---------------------------------------------------------------- helpers

    function text(value) {
        return value == null ? "" : String(value);
    }

    /** Dates in artwork.json are MM-DD-YYYY, which isn't a format Date() is
     *  required to understand — parse it explicitly rather than per-browser. */
    function dateValue(item) {
        const parts = text(item.date).split("-");
        if (parts.length === 3) {
            const stamp = Date.UTC(+parts[2], +parts[0] - 1, +parts[1]);
            if (!isNaN(stamp)) return stamp;
        }
        const fallback = new Date(item.date).getTime();
        return isNaN(fallback) ? 0 : fallback;
    }

    /** Items with no recorded time sort to the end of both time sorts. */
    function timeValue(item) {
        const minutes = parseFloat(item.total_time);
        return isNaN(minutes) ? -1 : minutes;
    }

    /** Every field is treated as a list, so single values and arrays (tags)
     *  flow through the same counting and matching code. */
    function valuesOf(item, field) {
        const raw = item[field];
        if (raw == null) return [];
        const list = Array.isArray(raw) ? raw : [raw];
        return list
            .map(entry => text(entry).trim())
            .filter(entry => entry.length > 0);
    }

    function labelFor(field) {
        if (FILTER_CONFIG.fieldLabels[field]) return FILTER_CONFIG.fieldLabels[field];
        return field
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, character => character.toUpperCase());
    }

    function escapeHtml(value) {
        return text(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    /**
     * Local stand-in for arch-style-lib's positionPopover(): places a fixed
     * panel under its trigger, clamped to the viewport, flipping above when
     * there's no room below. Same signature, so the port is an import swap.
     */
    function positionPopover(popover, anchor, opts) {
        const options = opts || {};
        const gap = options.gap != null ? options.gap : 8;
        const edgePadding = options.edgePadding != null ? options.edgePadding : 8;
        const align = options.align || "start";

        const rect = anchor.getBoundingClientRect();
        const width = popover.offsetWidth || 220;
        const height = popover.offsetHeight || 240;

        const idealLeft = align === "end"
            ? rect.right - width
            : align === "center"
                ? rect.left + rect.width / 2 - width / 2
                : rect.left;
        const left = Math.max(edgePadding, Math.min(idealLeft, window.innerWidth - width - edgePadding));
        popover.style.left = left + "px";

        const spaceBelow = window.innerHeight - rect.bottom - gap;
        if (spaceBelow < height && rect.top > height + gap) {
            popover.style.top = (rect.top - height - gap) + "px";
        } else {
            popover.style.top = (rect.bottom + gap) + "px";
            // Never let a tall list run off the bottom of the screen.
            popover.style.maxHeight = Math.max(160, spaceBelow - edgePadding) + "px";
        }
    }

    // ------------------------------------------------------------ facet model

    /**
     * Discovers which fields are worth filtering on, straight from the data.
     * A field qualifies when it isn't excluded, holds string-ish values, and
     * has at least FILTER_CONFIG.minOptions distinct ones.
     */
    function discoverFacets(items) {
        const tally = new Map();

        items.forEach(item => {
            Object.keys(item).forEach(field => {
                if (FILTER_CONFIG.excludedFields.indexOf(field) !== -1) return;
                const values = valuesOf(item, field);
                if (!values.length) return;
                if (!tally.has(field)) tally.set(field, new Map());
                const counts = tally.get(field);
                values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
            });
        });

        const facets = [];
        tally.forEach((counts, field) => {
            if (counts.size < FILTER_CONFIG.minOptions) return;
            const options = Array.from(counts.entries())
                .map(entry => ({ value: entry[0], total: entry[1] }))
                .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
            facets.push({ field: field, label: labelFor(field), options: options });
        });

        const order = FILTER_CONFIG.fieldOrder;
        facets.sort((a, b) => {
            const indexA = order.indexOf(a.field);
            const indexB = order.indexOf(b.field);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.label.localeCompare(b.label);
        });
        return facets;
    }

    /** Lower-cased blob of everything the text box should be able to hit. */
    function searchHaystack(item, facets) {
        const fields = FILTER_CONFIG.searchFields.concat(facets.map(facet => facet.field));
        const seen = {};
        const parts = [];
        fields.forEach(field => {
            if (seen[field]) return;
            seen[field] = true;
            parts.push.apply(parts, valuesOf(item, field));
        });
        parts.push(text(item.date));
        return parts.join(" ").toLowerCase();
    }

    // ------------------------------------------------------------- the widget

    function GalleryFilters(options) {
        this.items = options.items || [];
        this.mount = options.mount;
        this.onChange = options.onChange || function () { };
        this.syncUrl = options.syncUrl !== false;

        this.facets = discoverFacets(this.items);
        this.haystacks = new Map();
        this.items.forEach(item => this.haystacks.set(item, searchHaystack(item, this.facets)));

        this.state = {
            query: "",
            sort: DEFAULT_SORT,
            selections: {} // field -> Set of selected values
        };
        this.facets.forEach(facet => { this.state.selections[facet.field] = new Set(); });

        this.applyDefaults(options.defaults);
        if (this.syncUrl) this.readUrl();

        this.groups = [];
        this.openGroup = null;
        this.render();
        this.bindGlobal();
        this.update();
    }

    /** Pre-checked selections, e.g. { artist: ["FinniTheFox"] }. Unlike a hard
     *  filter these stay visible in the bar and the visitor can clear them. */
    GalleryFilters.prototype.applyDefaults = function (defaults) {
        if (!defaults) return;
        Object.keys(defaults).forEach(field => {
            const set = this.state.selections[field];
            if (!set) return;
            const values = Array.isArray(defaults[field]) ? defaults[field] : [defaults[field]];
            values.forEach(value => set.add(text(value)));
        });
    };

    GalleryFilters.prototype.readUrl = function () {
        const params = new URLSearchParams(window.location.search);
        const query = params.get("q");
        if (query) this.state.query = query;
        const sort = params.get("sort");
        if (sort && SORTS.some(entry => entry.id === sort)) this.state.sort = sort;

        this.facets.forEach(facet => {
            const values = params.getAll(facet.field);
            if (!values.length) return;
            // A facet present in the URL replaces its default entirely, so a
            // shared link shows exactly what the sharer was looking at.
            const set = new Set();
            values.forEach(value => value.split("|").forEach(part => {
                if (part) set.add(part);
            }));
            this.state.selections[facet.field] = set;
        });
    };

    GalleryFilters.prototype.writeUrl = function () {
        if (!this.syncUrl) return;
        const params = new URLSearchParams();
        if (this.state.query) params.set("q", this.state.query);
        if (this.state.sort !== DEFAULT_SORT) params.set("sort", this.state.sort);
        this.facets.forEach(facet => {
            const set = this.state.selections[facet.field];
            if (set && set.size) params.set(facet.field, Array.from(set).join("|"));
        });
        const search = params.toString();
        const url = window.location.pathname + (search ? "?" + search : "") + window.location.hash;
        window.history.replaceState(null, "", url);
    };

    // --- matching -----------------------------------------------------------

    GalleryFilters.prototype.matchesQuery = function (item) {
        const query = this.state.query.trim().toLowerCase();
        if (!query) return true;
        const haystack = this.haystacks.get(item) || "";
        // Every whitespace-separated term must appear somewhere: typing
        // "finni sketch" narrows rather than widens.
        return query.split(/\s+/).every(term => haystack.indexOf(term) !== -1);
    };

    /**
     * Values inside one facet are OR'd, facets are AND'd together.
     * `skipField` leaves one facet out, which is how that facet's own option
     * counts stay live without a selection there zeroing out its siblings.
     */
    GalleryFilters.prototype.matchesFacets = function (item, skipField) {
        return this.facets.every(facet => {
            if (facet.field === skipField) return true;
            const set = this.state.selections[facet.field];
            if (!set || !set.size) return true;
            return valuesOf(item, facet.field).some(value => set.has(value));
        });
    };

    GalleryFilters.prototype.results = function () {
        const matched = this.items.filter(item => this.matchesQuery(item) && this.matchesFacets(item, null));
        const sort = SORTS.filter(entry => entry.id === this.state.sort)[0] || SORTS[0];
        return matched.slice().sort(sort.compare);
    };

    /** Counts for one facet's options, given everything else that's active. */
    GalleryFilters.prototype.countsFor = function (field) {
        const counts = new Map();
        this.items.forEach(item => {
            if (!this.matchesQuery(item)) return;
            if (!this.matchesFacets(item, field)) return;
            valuesOf(item, field).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
        });
        return counts;
    };

    // --- rendering ----------------------------------------------------------

    GalleryFilters.prototype.render = function () {
        const self = this;
        this.mount.classList.add("gallery-controls");
        this.mount.innerHTML =
            '<div class="gallery-controls__row">' +
                '<div class="gallery-search">' +
                    '<input class="gallery-search__input" type="search" placeholder="Search artwork…" ' +
                        'aria-label="Search artwork" autocomplete="off">' +
                '</div>' +
                '<div class="gallery-controls__filters"></div>' +
            '</div>' +
            '<div class="gallery-controls__status">' +
                '<span class="gallery-controls__count" role="status" aria-live="polite"></span>' +
                '<div class="gallery-chips"></div>' +
                '<button class="gallery-controls__reset" type="button" hidden>Clear all</button>' +
            '</div>';

        this.searchInput = this.mount.querySelector(".gallery-search__input");
        this.filtersRow = this.mount.querySelector(".gallery-controls__filters");
        this.countEl = this.mount.querySelector(".gallery-controls__count");
        this.chipsEl = this.mount.querySelector(".gallery-chips");
        this.resetButton = this.mount.querySelector(".gallery-controls__reset");

        this.searchInput.value = this.state.query;
        let debounce;
        this.searchInput.addEventListener("input", () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                self.state.query = self.searchInput.value;
                self.update();
            }, 150);
        });

        this.facets.forEach(facet => self.filtersRow.appendChild(self.buildFacetGroup(facet)));
        this.filtersRow.appendChild(this.buildSortGroup());

        this.chipsEl.addEventListener("click", event => {
            const chip = event.target.closest("[data-chip-field]");
            if (!chip) return;
            self.state.selections[chip.dataset.chipField].delete(chip.dataset.chipValue);
            self.update();
        });

        this.resetButton.addEventListener("click", () => self.clearAll());
    };

    /** Popovers live at <body> level so no ancestor's overflow or transform
     *  can clip them — the same containing-block rule arch-style-lib documents. */
    GalleryFilters.prototype.makeGroup = function (label, popoverClass) {
        const group = document.createElement("div");
        group.className = "filter-group";
        group.innerHTML =
            '<button class="filter-trigger" type="button" aria-haspopup="true" aria-expanded="false">' +
                '<span class="filter-trigger__label">' + escapeHtml(label) + "</span>" +
                '<span class="filter-trigger__badge" hidden></span>' +
                '<span class="filter-trigger__chevron" aria-hidden="true"></span>' +
            "</button>";

        const popover = document.createElement("div");
        popover.className = "filter-popover " + (popoverClass || "");
        popover.setAttribute("role", "group");
        popover.setAttribute("aria-label", label);
        document.body.appendChild(popover);

        const trigger = group.querySelector(".filter-trigger");
        trigger.addEventListener("click", () => this.toggleGroup(entry));

        const entry = { group: group, trigger: trigger, popover: popover };
        this.groups.push(entry);
        return entry;
    };

    GalleryFilters.prototype.buildFacetGroup = function (facet) {
        const self = this;
        const entry = this.makeGroup(facet.label);
        entry.facet = facet;

        const searchable = facet.options.length > FILTER_CONFIG.optionSearchThreshold;
        entry.popover.innerHTML =
            '<div class="filter-popover__head">' +
                "<span>" + escapeHtml(facet.label) + "</span>" +
                '<button class="filter-popover__clear" type="button">Clear</button>' +
            "</div>" +
            (searchable
                ? '<input class="filter-popover__search" type="search" placeholder="Filter ' +
                  escapeHtml(facet.label.toLowerCase()) + '…" aria-label="Filter options" autocomplete="off">'
                : "") +
            '<div class="filter-options"></div>';

        const list = entry.popover.querySelector(".filter-options");
        entry.optionRows = facet.options.map(option => {
            const row = document.createElement("label");
            row.className = "filter-option";
            row.innerHTML =
                '<input class="filter-option__input" type="checkbox" value="' + escapeHtml(option.value) + '">' +
                '<span class="filter-option__box" aria-hidden="true"></span>' +
                '<span class="filter-option__label">' + escapeHtml(option.value) + "</span>" +
                '<span class="filter-option__count"></span>';
            list.appendChild(row);

            const input = row.querySelector("input");
            input.addEventListener("change", () => {
                const set = self.state.selections[facet.field];
                if (input.checked) set.add(option.value); else set.delete(option.value);
                self.update();
            });
            return { option: option, row: row, input: input, count: row.querySelector(".filter-option__count") };
        });

        entry.popover.querySelector(".filter-popover__clear").addEventListener("click", () => {
            self.state.selections[facet.field].clear();
            self.update();
        });

        const optionSearch = entry.popover.querySelector(".filter-popover__search");
        if (optionSearch) {
            optionSearch.addEventListener("input", () => {
                const needle = optionSearch.value.trim().toLowerCase();
                entry.optionRows.forEach(entryRow => {
                    const hit = !needle || entryRow.option.value.toLowerCase().indexOf(needle) !== -1;
                    entryRow.row.hidden = !hit;
                });
            });
        }

        return entry.group;
    };

    GalleryFilters.prototype.buildSortGroup = function () {
        const self = this;
        const entry = this.makeGroup("Sort", "filter-popover--sort");
        entry.isSort = true;

        entry.popover.innerHTML = '<div class="filter-popover__head"><span>Sort by</span></div>' +
            '<div class="filter-options"></div>';
        const list = entry.popover.querySelector(".filter-options");

        entry.sortRows = SORTS.map(sort => {
            const row = document.createElement("label");
            row.className = "filter-option filter-option--radio";
            row.innerHTML =
                '<input class="filter-option__input" type="radio" name="gallery-sort" value="' + sort.id + '">' +
                '<span class="filter-option__box" aria-hidden="true"></span>' +
                '<span class="filter-option__label">' + escapeHtml(sort.label) + "</span>";
            list.appendChild(row);

            const input = row.querySelector("input");
            input.addEventListener("change", () => {
                if (!input.checked) return;
                self.state.sort = sort.id;
                self.closeGroup();
                self.update();
            });
            return { sort: sort, input: input };
        });

        return entry.group;
    };

    // --- popover open/close -------------------------------------------------

    GalleryFilters.prototype.toggleGroup = function (entry) {
        if (this.openGroup === entry) {
            this.closeGroup();
            return;
        }
        this.closeGroup();
        this.openGroup = entry;
        entry.popover.style.maxHeight = "";
        entry.popover.classList.add("filter-popover--open");
        entry.trigger.setAttribute("aria-expanded", "true");
        entry.group.classList.add("filter-group--open");
        positionPopover(entry.popover, entry.trigger);

        const optionSearch = entry.popover.querySelector(".filter-popover__search");
        if (optionSearch) optionSearch.focus();
    };

    GalleryFilters.prototype.closeGroup = function () {
        const entry = this.openGroup;
        if (!entry) return;
        entry.popover.classList.remove("filter-popover--open");
        entry.trigger.setAttribute("aria-expanded", "false");
        entry.group.classList.remove("filter-group--open");
        this.openGroup = null;
    };

    GalleryFilters.prototype.bindGlobal = function () {
        const self = this;
        document.addEventListener("pointerdown", event => {
            const entry = self.openGroup;
            if (!entry) return;
            if (entry.popover.contains(event.target) || entry.group.contains(event.target)) return;
            self.closeGroup();
        }, true);

        document.addEventListener("keydown", event => {
            if (event.key !== "Escape" || !self.openGroup) return;
            const trigger = self.openGroup.trigger;
            self.closeGroup();
            trigger.focus();
        });

        const reposition = () => {
            if (self.openGroup) positionPopover(self.openGroup.popover, self.openGroup.trigger);
        };
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
    };

    // --- state -> UI --------------------------------------------------------

    GalleryFilters.prototype.clearAll = function () {
        this.state.query = "";
        this.searchInput.value = "";
        this.facets.forEach(facet => this.state.selections[facet.field].clear());
        this.update();
    };

    GalleryFilters.prototype.update = function () {
        const results = this.results();
        this.syncGroups();
        this.syncStatus(results.length);
        this.writeUrl();
        this.onChange(results);
    };

    GalleryFilters.prototype.syncGroups = function () {
        const self = this;
        this.groups.forEach(entry => {
            if (entry.isSort) {
                entry.sortRows.forEach(row => { row.input.checked = row.sort.id === self.state.sort; });
                const active = entry.sortRows.filter(row => row.sort.id === self.state.sort)[0];
                entry.trigger.querySelector(".filter-trigger__label").textContent =
                    active ? active.sort.label : "Sort";
                return;
            }

            const set = self.state.selections[entry.facet.field];
            const counts = self.countsFor(entry.facet.field);

            entry.optionRows.forEach(row => {
                const count = counts.get(row.option.value) || 0;
                row.input.checked = set.has(row.option.value);
                row.count.textContent = count;
                // Zero-count options stay listed (so the list doesn't jump
                // around) but read as unavailable unless they're already on.
                row.row.classList.toggle("filter-option--empty", count === 0 && !row.input.checked);
            });

            const badge = entry.trigger.querySelector(".filter-trigger__badge");
            badge.textContent = set.size;
            badge.hidden = set.size === 0;
            entry.group.classList.toggle("filter-group--active", set.size > 0);
        });
    };

    GalleryFilters.prototype.syncStatus = function (shown) {
        const total = this.items.length;
        const noun = total === 1 ? "piece" : "pieces";
        this.countEl.textContent = shown === total
            ? "Showing all " + total + " " + noun
            : "Showing " + shown + " of " + total + " " + noun;

        const chips = [];
        this.facets.forEach(facet => {
            this.state.selections[facet.field].forEach(value => {
                chips.push(
                    '<button class="gallery-chip" type="button" data-chip-field="' + escapeHtml(facet.field) +
                    '" data-chip-value="' + escapeHtml(value) + '">' +
                    '<span class="gallery-chip__field">' + escapeHtml(facet.label) + "</span>" +
                    '<span class="gallery-chip__value">' + escapeHtml(value) + "</span>" +
                    '<span class="gallery-chip__remove" aria-hidden="true">×</span>' +
                    '<span class="visually-hidden">Remove filter</span>' +
                    "</button>"
                );
            });
        });
        this.chipsEl.innerHTML = chips.join("");
        this.resetButton.hidden = chips.length === 0 && !this.state.query;
        this.mount.classList.toggle("gallery-controls--filtered", shown !== total);
    };

    // ------------------------------------------------------------------- init

    /**
     * @param {{ items: object[], mount: Element|string, onChange: function,
     *           defaults?: object, syncUrl?: boolean }} options
     */
    function initGalleryFilters(options) {
        const mount = typeof options.mount === "string"
            ? document.querySelector(options.mount)
            : options.mount;
        if (!mount) {
            console.warn("gallery-filters: mount element not found:", options.mount);
            options.onChange(options.items || []);
            return null;
        }
        return new GalleryFilters(Object.assign({}, options, { mount: mount }));
    }

    global.initGalleryFilters = initGalleryFilters;
    global.GalleryFilters = GalleryFilters;
    global.GALLERY_FILTER_CONFIG = FILTER_CONFIG;
})(window);
