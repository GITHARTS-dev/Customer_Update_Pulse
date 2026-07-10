/*
 * One-off script: generates Invoice_<Month>_2026.xlsx files for Jan..May 2026
 * by varying the existing Invoice_June_2026.xlsx data with month-specific and
 * per-person multipliers. Run with: node scripts/generate_history.cjs
 */
const path = require("path");
const XLSX = require("xlsx");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "Invoice_June_2026.xlsx");

// Month scaling profiles - chosen to produce a trend with peaks and troughs.
// hours: scale on Hours/Days/Total (revenue) per person row
// salary: scale on the Salary column
// Some months drop a few people (no work) and a couple of months add ESP variance.
const MONTHS = [
  { key: "January",  num: 1, hours: 1.35, salary: 1.05, dropPeople: [],           espScale: 1.20 },
  { key: "February", num: 2, hours: 1.20, salary: 1.05, dropPeople: [],           espScale: 1.15 },
  { key: "March",    num: 3, hours: 0.75, salary: 1.00, dropPeople: ["Haswanth"], espScale: 0.90 },
  { key: "April",    num: 4, hours: 1.10, salary: 0.95, dropPeople: [],           espScale: 1.05 },
  { key: "May",      num: 5, hours: 0.85, salary: 1.00, dropPeople: ["Hari"],     espScale: 0.95 },
];

// Deterministic per-person jitter so each month looks individual but reproducible
function jitter(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // map to 0.82..1.18
  const r = ((h >>> 0) % 10000) / 10000;
  return 0.82 + r * 0.36;
}

function lastName(billingRows) {
  let last = "";
  return billingRows.map((r) => {
    const cur = String(r.Name ?? "").trim();
    if (cur) last = cur;
    return last;
  });
}

function transformBilling(rows, month) {
  const owners = lastName(rows);
  const out = [];
  let runningTotal = 0;

  rows.forEach((r, i) => {
    const owner = owners[i] || "";
    const isGrandTotal =
      String(r["Project"] ?? "").toLowerCase().includes("grand total") ||
      String(r[" Daily Rate "] ?? "").toLowerCase().includes("grand total") ||
      String(r[" Total "] ?? "").toLowerCase().includes("grand total");

    if (isGrandTotal) return;

    if (month.dropPeople.some((d) => owner.toLowerCase().includes(d.toLowerCase()))) {
      return; // skip this person for this month
    }

    const personJitter = jitter(`${month.key}-${owner}`);
    const projectJitter = jitter(`${month.key}-${owner}-${r.Project}`);
    const hoursMul = month.hours * personJitter * (0.9 + projectJitter * 0.2);
    const salaryMul = month.salary;

    const hours = +(Number(r.Hours || 0) * hoursMul).toFixed(2);
    const days = +(hours / 8).toFixed(4);
    const dailyRate = Number(r[" Daily Rate "] || 0);
    const total = +(dailyRate * days).toFixed(2);
    const salary = +(Number(r[" Salary "] || 0) * salaryMul).toFixed(0);

    runningTotal += total;

    out.push({
      Name: r.Name,
      Project: r.Project,
      Hours: hours,
      Days: days,
      " Daily Rate ": dailyRate,
      " Total ": total,
      " Salary ": salary,
    });
  });

  out.push({
    Name: "",
    Project: "",
    Hours: "",
    Days: "",
    " Daily Rate ": "Grand Total",
    " Total ": +runningTotal.toFixed(2),
    " Salary ": "",
  });

  return out;
}

function transformEsp(rows, month) {
  const out = [];
  let runningTotal = 0;
  rows.forEach((r) => {
    const isGrandTotal =
      String(r["Project"] ?? "").toLowerCase().includes("grand total") ||
      String(r["Daily Rate"] ?? "").toLowerCase().includes("grand total");
    if (isGrandTotal) return;

    const j = jitter(`${month.key}-esp-${r.Name}`);
    const hoursMul = month.espScale * (0.85 + j * 0.3);
    const hours = +(Number(r.Hours || 0) * hoursMul).toFixed(2);
    const days = +(hours / 8).toFixed(4);
    const total = +(Number(r.Total || 0) * hoursMul).toFixed(2);
    const salary = +(Number(r[" Salary "] || 0) * hoursMul).toFixed(2);

    runningTotal += total;
    out.push({
      Name: r.Name,
      Project: r.Project,
      Hours: hours,
      Days: days,
      "Daily Rate": "",
      Total: total,
      " Salary ": salary,
    });
  });
  out.push({
    Name: "",
    Project: "",
    Hours: "",
    Days: "",
    "Daily Rate": "Grand Total",
    Total: +runningTotal.toFixed(2),
    " Salary ": "",
  });
  return out;
}

function main() {
  const src = XLSX.readFile(SRC);
  const billingRows = XLSX.utils.sheet_to_json(src.Sheets["Billing"], { defval: "" });
  const espRows = XLSX.utils.sheet_to_json(src.Sheets["ESP"], { defval: "" });

  MONTHS.forEach((m) => {
    const newBilling = transformBilling(billingRows, m);
    const newEsp = transformEsp(espRows, m);

    const wb = XLSX.utils.book_new();
    const espHeaders = ["Name", "Project", "Hours", "Days", "Daily Rate", "Total", " Salary "];
    const billHeaders = ["Name", "Project", "Hours", "Days", " Daily Rate ", " Total ", " Salary "];

    const espSheet = XLSX.utils.json_to_sheet(newEsp, { header: espHeaders });
    const billSheet = XLSX.utils.json_to_sheet(newBilling, { header: billHeaders });

    XLSX.utils.book_append_sheet(wb, espSheet, "ESP");
    XLSX.utils.book_append_sheet(wb, billSheet, "Billing");

    const outPath = path.join(ROOT, `Invoice_${m.key}_2026.xlsx`);
    XLSX.writeFile(wb, outPath);
    console.log("wrote", path.basename(outPath), "billing rows:", newBilling.length, "esp rows:", newEsp.length);
  });
}

main();
