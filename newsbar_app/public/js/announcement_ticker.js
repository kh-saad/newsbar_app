// announcement_ticker.js
// Global scrolling news-bar for ERPNext Desk (system user announcements).
// Include via hooks.py -> app_include_js. No changes to core files needed.

frappe.provide("frappe.announcement_ticker");

frappe.announcement_ticker = {
    DOCTYPE: "System Announcement",   // create this DocType once via Desk UI (see notes below)
    REFRESH_INTERVAL_MS: 5 * 60 * 1000, // re-check for new/changed announcements every 5 min
    DISMISS_DURATION_MS: 5 * 60 * 1000, // if the user closes the bar, it comes back after this long
    BAR_ID: "global-announcement-ticker",

    init: function () {
        this.injectStyles();
        this.renderShell();
        this.fetchAndRender();
        setInterval(() => this.fetchAndRender(), this.REFRESH_INTERVAL_MS);
    },

    injectStyles: function () {
        if (document.getElementById("announcement-ticker-styles")) return;
        const style = document.createElement("style");
        style.id = "announcement-ticker-styles";
        style.innerHTML = `
            #${this.BAR_ID} {
                position: sticky;
                top: 0;
                z-index: 999;
                display: flex;
                align-items: center;
                background: #1a1a2e;
                color: #f5f5f5;
                font-size: 13px;
                font-family: var(--font-stack, inherit);
                height: 32px;
                overflow: hidden;
                white-space: nowrap;
                border-bottom: 1px solid #2f2f4a;
            }
            #${this.BAR_ID}.is-empty { display: none; }
            #${this.BAR_ID} .ticker-label {
                flex-shrink: 0;
                background: #b55d1a;
                color: #fff;
                font-weight: 600;
                padding: 0 12px;
                height: 100%;
                display: flex;
                align-items: center;
                letter-spacing: 0.03em;
                text-transform: uppercase;
                font-size: 10.5px;
            }
            #${this.BAR_ID} .ticker-track-wrap {
                flex: 1;
                overflow: hidden;
                position: relative;
                height: 100%;
            }
            #${this.BAR_ID} .ticker-track {
                display: inline-flex;
                align-items: center;
                height: 100%;
                white-space: nowrap;
                position: absolute;
                will-change: transform;
                animation: ticker-scroll linear infinite;
            }
            #${this.BAR_ID} .ticker-item {
                padding: 0 40px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            #${this.BAR_ID} .ticker-item .priority-dot {
                width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
            }
            #${this.BAR_ID} .priority-Critical .priority-dot { background: #ff5c5c; }
            #${this.BAR_ID} .priority-Warning .priority-dot { background: #ffc857; }
            #${this.BAR_ID} .priority-Info .priority-dot { background: #5cc8ff; }
            #${this.BAR_ID} .ticker-close {
                flex-shrink: 0;
                cursor: pointer;
                padding: 0 12px;
                opacity: 0.6;
            }
            #${this.BAR_ID} .ticker-close:hover { opacity: 1; }
            @keyframes ticker-scroll {
                from { transform: translateX(0); }
                to   { transform: translateX(-50%); }
            }
        `;
        document.head.appendChild(style);
    },

    renderShell: function () {
        if (document.getElementById(this.BAR_ID)) return;
        const bar = document.createElement("div");
        bar.id = this.BAR_ID;
        bar.className = "is-empty";
        bar.innerHTML = `
            <div class="ticker-label">${__("Announcements")}</div>
            <div class="ticker-track-wrap"><div class="ticker-track"></div></div>
            <div class="ticker-close" title="${__("Dismiss for this session")}">&times;</div>
        `;
        // Insert right under the navbar, above the page body
        const navbar = document.querySelector(".navbar");
        if (navbar && navbar.parentNode) {
            navbar.parentNode.insertBefore(bar, navbar.nextSibling);
        } else {
            document.body.prepend(bar);
        }
        bar.querySelector(".ticker-close").addEventListener("click", () => {
            const until = Date.now() + this.DISMISS_DURATION_MS;
            sessionStorage.setItem("announcement_ticker_dismissed_until", String(until));
            bar.classList.add("is-empty");
            // comes back automatically once the dismiss window ends, even with no page navigation
            setTimeout(() => this.fetchAndRender(), this.DISMISS_DURATION_MS + 500);
        });
    },

    fetchAndRender: function () {
        const dismissedUntil = parseInt(sessionStorage.getItem("announcement_ticker_dismissed_until") || "0", 10);
        if (Date.now() < dismissedUntil) return; // still inside the dismiss window
        if (dismissedUntil) sessionStorage.removeItem("announcement_ticker_dismissed_until"); // window passed, clear it

        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: this.DOCTYPE,
                filters: { is_active: 1 },
                fields: ["message", "priority"],
                order_by: "priority desc, modified desc",
                limit_page_length: 20,
            },
            callback: (r) => {
                const rows = (r.message || []);
                const bar = document.getElementById(this.BAR_ID);
                if (!bar) return;
                const track = bar.querySelector(".ticker-track");

                if (!rows.length) {
                    bar.classList.add("is-empty");
                    track.innerHTML = "";
                    return;
                }

                const itemsHtml = rows.map(row => `
                    <span class="ticker-item priority-${frappe.utils.escape_html(row.priority || "Info")}">
                        <span class="priority-dot"></span>
                        ${frappe.utils.escape_html(row.message)}
                    </span>
                `).join("");

                // duplicate content once so the CSS animation (translateX -50%) loops seamlessly
                track.innerHTML = itemsHtml + itemsHtml;

                // speed scales with content length so short and long lists both read comfortably
                // (lower numbers here = faster scroll)
                const durationSeconds = Math.max(14, rows.length * 6);
                track.style.animationDuration = `${durationSeconds}s`;

                bar.classList.remove("is-empty");
            },
            error: () => {
                // Fail silently — a missing/renamed DocType should never break the Desk
            },
        });
    },
};

$(document).ready(function () {
    // Desk is a single-page app; this runs once per full page load/session
    frappe.announcement_ticker.init();
});
