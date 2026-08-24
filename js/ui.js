"use strict";

const UI = {
  el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  },

  fa(name) {
    return '<i class="fa-solid fa-' + name + '"></i>';
  },

  showToast(message, { duration = 2600, type = "" } = {}) {
    let host = document.getElementById("toasts");
    if (!host) {
      host = UI.el("div", "toasts");
      host.id = "toasts";
      document.body.appendChild(host);
    }
    const t = UI.el("div", "toast" + (type ? " " + type : ""));
    t.textContent = message;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    if (duration > 0) {
      setTimeout(() => hideToast(t), duration);
    }
    return t;
  },

  showTaskToast(label, onCancel) {
    let host = document.getElementById("toasts");
    if (!host) {
      host = UI.el("div", "toasts");
      host.id = "toasts";
      document.body.appendChild(host);
    }
    const t = UI.el("div", "toast task");
    t.innerHTML = '<span class="spinner"></span><span class="label"></span>';
    t.querySelector(".label").textContent = label + " (click to stop)";
    if (onCancel) {
      t.addEventListener("click", () => {
        const labelEl = t.querySelector(".label");
        labelEl.textContent = "Stopping…";
        t.classList.add("stopping");
        onCancel();
      });
    }
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    return t;
  },

  finishTaskToast(t, reason) {
    if (!t) return;
    const labelEl = t.querySelector(".label");
    if (labelEl) labelEl.textContent = reason || "Stopped";
    t.classList.add("stopping");
    setTimeout(() => hideToast(t), 1200);
  },

  openModal(contentEl, { title = "", wide = false, onBackdrop = null } = {}) {
    const overlay = UI.el("div", "modal-overlay");
    const modal = UI.el("div", "modal" + (wide ? " wide" : ""));
    const head = UI.el("div", "modal-head");
    if (title) head.appendChild(UI.el("h3", "", title));
    const close = UI.el("button", "iconbtn", UI.fa("xmark"));
    close.title = "Close";
    close.addEventListener("click", () => overlay.remove());
    head.appendChild(close);
    modal.appendChild(head);
    const body = UI.el("div", "modal-body");
    body.appendChild(contentEl);
    modal.appendChild(body);
    contentEl.querySelectorAll(".modal-actions").forEach((row) => modal.appendChild(row));
    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        if (onBackdrop) onBackdrop();
        else overlay.remove();
      }
    });
    document.body.appendChild(overlay);
    return overlay;
  },

  confirmModal({ title = "Are you sure?", message = "", confirmText = "Confirm", danger = true, extra = null }) {
    return new Promise((resolve) => {
      const wrap = UI.el("div", "modal-body-stack");
      wrap.appendChild(UI.el("p", "modal-desc", message));
      if (extra) wrap.appendChild(extra);
      const row = UI.el("div", "modal-actions");
      const cancel = UI.el("button", "btn ghost", "Cancel");
      const ok = UI.el("button", "btn " + (danger ? "danger" : "primary"), confirmText);
      cancel.addEventListener("click", () => { overlay.remove(); resolve(false); });
      ok.addEventListener("click", () => { overlay.remove(); resolve(true); });
      row.append(ok, cancel);
      wrap.appendChild(row);
      const overlay = UI.openModal(wrap, { title });
    });
  },

  tooltip(iconEl, html) {
    let tip = iconEl._tip;
    const show = () => {
      if (tip) { tip.classList.add("show"); return; }
      tip = UI.el("div", "tooltip");
      tip.innerHTML = html;
      document.body.appendChild(tip);
      iconEl._tip = tip;
      const r = iconEl.getBoundingClientRect();
      const tr = tip.getBoundingClientRect();
      let top = r.bottom + 8;
      if (top + tr.height > window.innerHeight) top = r.top - tr.height - 8;
      let left = r.left + r.width / 2 - tr.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
      tip.style.top = top + "px";
      tip.style.left = left + "px";
      requestAnimationFrame(() => tip.classList.add("show"));
    };
    const hide = () => { if (tip) { tip.classList.remove("show"); setTimeout(() => tip && tip.remove(), 150); tip = null; iconEl._tip = null; } };
    iconEl.addEventListener("mouseenter", show);
    iconEl.addEventListener("mouseleave", hide);
    iconEl.addEventListener("focus", show);
    iconEl.addEventListener("blur", hide);
  },
};

function hideToast(t) {
  t.classList.remove("in");
  setTimeout(() => t.remove(), 250);
}

window.UI = UI;
