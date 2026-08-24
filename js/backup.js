"use strict";

const BACKUP_FORMAT = "pfrp-backup";
const BACKUP_VERSION = 1;
const BACKUP_STORES = ["characters", "threads", "messages", "memories", "lore", "images", "scenes"];

async function exportBackup() {
  const data = {};
  for (const s of BACKUP_STORES) {
    data[s] = await pfrpDB.getAll(s);
  }
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: structuredClone(pfrpSettings.data),
    data,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  a.download = "pfrp-backup-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".json";
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  UI.showToast("Backup exported");
}

async function importBackupFile(file) {
  if (!file) return;
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    UI.showToast("That file is not a valid PFRP backup (not JSON).", { type: "err" });
    return;
  }
  if (!backup || backup.format !== BACKUP_FORMAT || !backup.data) {
    UI.showToast("That file is not a PFRP backup.", { type: "err" });
    return;
  }
  const totals = BACKUP_STORES.map((s) => (Array.isArray(backup.data[s]) ? backup.data[s].length : 0));
  const total = totals.reduce((a, b) => a + b, 0);
  const ok = await UI.confirmModal({
    title: "Import backup?",
    message: "This merges the backup into your current data: " + BACKUP_STORES.map((s, i) => totals[i] + " " + s).filter((x, i) => totals[i]).join(", ") + " (" + total + " records). Existing records with the same id are overwritten; new ones are added. Your settings (including API keys) are also restored from the backup.",
    confirmText: "Import",
  });
  if (!ok) return;
  let imported = 0;
  let skipped = 0;
  for (const s of BACKUP_STORES) {
    const recs = backup.data[s];
    if (!Array.isArray(recs)) continue;
    for (const rec of recs) {
      if (!rec || typeof rec !== "object") continue;
      try {
        if (rec.id != null) await pfrpDB.put(s, rec);
        else await pfrpDB.add(s, rec);
        imported++;
      } catch {
        skipped++;
      }
    }
  }
  if (backup.settings && typeof backup.settings === "object") {
    const clean = JSON.parse(JSON.stringify(backup.settings));
    if (clean.user && clean.user.name) clean.user.name = clean.user.name.replace(/[\u0000-\u001f]/g, "");
    pfrpSettings.data = Object.assign(pfrpSettings.data, clean);
    pfrpSettings.save();
  }
  await loadData();
  applyTheme();
  UI.showToast("Backup restored: " + imported + " records" + (skipped ? ", " + skipped + " skipped" : ""));
  return true;
}

window.BACKUP_FORMAT = BACKUP_FORMAT;
window.exportBackup = exportBackup;
window.importBackupFile = importBackupFile;
