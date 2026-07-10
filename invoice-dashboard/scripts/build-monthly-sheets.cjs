/* Builds EVORA Invoice Template.xlsx with 6 monthly sheets (Jan26..Jun26).
 *
 * - Uses exceljs (preserves styles, fills, fonts, formulas, number formats).
 * - Style reference: "Old format.xlsx" → May26 sheet. We extract its cell styles
 *   for each role (header, person row, project row, totals row, etc.) and apply
 *   them to every generated sheet.
 * - Data (people, projects, daily rates, HARTS Pay): read from the current
 *   "EVORA Invoice Template.xlsx" May26 sheet. Daily rate and HARTS Pay are
 *   constant across all months. Hours are May26 hours × monthMul × varMul,
 *   where varMul is a deterministic per-(person, project, month) value in
 *   [0.85, 1.15] so re-runs are reproducible.
 * - All Days/Total/F/H/I cells are FORMULAS so they recompute from hours.
 */
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OLD_FORMAT = path.join(ROOT, "Old format.xlsx");
const OUT_FILE = path.join(ROOT, "EVORA Invoice Template.xlsx");

const MONTHS = [
  { sheet: "Jan26", date: new Date(Date.UTC(2026, 0, 1)), monthMul: 0.85 },
  { sheet: "Feb26", date: new Date(Date.UTC(2026, 1, 1)), monthMul: 0.92 },
  { sheet: "Mar26", date: new Date(Date.UTC(2026, 2, 1)), monthMul: 1.05 },
  { sheet: "Apr26", date: new Date(Date.UTC(2026, 3, 1)), monthMul: 0.98 },
  { sheet: "May26", date: new Date(Date.UTC(2026, 4, 1)), monthMul: 1.00 },
  { sheet: "Jun26", date: new Date(Date.UTC(2026, 5, 1)), monthMul: 1.12 },
];

const EXPENSES = [
  { name: "LinkedIn Recruiter Lite & Job promotion (Monthly)", amount: 300 },
  { name: "Innovex Visit - HYD (Hari, Chethan and Nikilesh)", amount: 500 },
  { name: "Strategy Inn.Workshop - BLR (Srimathi, Hari and Mohan)", amount: 650 },
];

// HARTS Pay rendered as `<INR>/111` formula (matches the Old format convention).
const HARTS_PAY_INR = {
  "Sreema Nallasivam": 0,
  "Savio": 300000,
  "Hari Ram": 500000,
  "Srimathi Ravi": 400000,
  "Sarath VR": 300000,
  "Renuka": 350000,
  "Mohanraja": 500000,
  "Sathana Selvaraj": 500000,
};
// Non-billable employees' total HARTS Pay (INR). Written into H of the Service
// Fee Total row as a constant `<INR>/111`. From the Old format reference.
const NON_BILLABLE_INR = 836990;

// FNV-1a → [0, 1) deterministic
function rand(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- 1. Extract data from current May26 ---------- */

function readMay26Data() {
  const wb = XLSX.readFile(OUT_FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["May26"], { header: 1, defval: "" });
  const people = [];
  let current = null;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const a = String(r[0] ?? "").trim();
    const cLabel = String(r[2] ?? "").toLowerCase();
    if (cLabel.includes("total") || cLabel === "sum") {
      if (cLabel.includes("service fee")) break;
      continue;
    }
    if (!a) continue;
    const hours = Number(r[1]) || 0;
    const rate = Number(r[3]) || 0;
    const total = Number(r[4]) || 0;
    if (!hours && !rate && !total) {
      current = { name: a, rate: 0, projects: [] };
      people.push(current);
      continue;
    }
    if (!current) continue;
    if (current.rate === 0 && rate > 0) current.rate = rate;
    current.projects.push({ name: a, hours });
  }
  return people;
}

/* ---------- 2. Extract style refs from Old format.xlsx ---------- */

async function readStyleRefs() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(OLD_FORMAT);
  const ws = wb.getWorksheet("May26");
  const ref = {
    headerGray: ws.getCell("A1").style,
    headerLabel: ws.getCell("B1").style,
    headerF: ws.getCell("F1").style,
    headerG: ws.getCell("G1").style,
    headerH: ws.getCell("H1").style,
    headerI: ws.getCell("I1").style,
    headerJ: ws.getCell("J1").style,
    personA: ws.getCell("A2").style,
    personOther: ws.getCell("B2").style,
    projectA: ws.getCell("A3").style,
    projectB: ws.getCell("B3").style,
    projectC: ws.getCell("C3").style,
    projectD: ws.getCell("D3").style,
    projectE: ws.getCell("E3").style,
    projectF: ws.getCell("F3").style,
    projectG: ws.getCell("G3").style,
    projectH: ws.getCell("H3").style,
    projectI: ws.getCell("I3").style,
    projectJ: ws.getCell("J3").style,
    totalsA: ws.getCell("A26").style,
    totalsB: ws.getCell("B26").style,
    totalsC: ws.getCell("C26").style,
    totalsE: ws.getCell("E26").style,
    totalsF: ws.getCell("F26").style,
    totalsG: ws.getCell("G26").style,
    totalsH: ws.getCell("H26").style,
    totalsI: ws.getCell("I26").style,
    totalsJ: ws.getCell("J26").style,
    expenseA: ws.getCell("A27").style,
    expenseE: ws.getCell("E27").style,
    sumLabel: ws.getCell("C31").style,
    sumValue: ws.getCell("E31").style,
    netLabel: ws.getCell("C33").style,
    netValue: ws.getCell("E33").style,
  };
  const widths = [];
  for (let i = 1; i <= 10; i++) widths.push(ws.getColumn(i).width);
  const headerHeight = ws.getRow(1).height;
  return { ref, widths, headerHeight };
}

/* ---------- 3. Build one sheet ---------- */

function buildSheet(wb, monthSpec, people, styles) {
  const { ref, widths, headerHeight } = styles;
  const ws = wb.addWorksheet(monthSpec.sheet, {
    views: [{ showGridLines: false }],
  });
  widths.forEach((w, i) => { if (w != null) ws.getColumn(i + 1).width = w; });

  // ---- Row 1: header
  ws.getRow(1).height = headerHeight || 32.1;
  ws.getCell("A1").value = monthSpec.date;       ws.getCell("A1").style = ref.headerGray;
  ws.getCell("B1").value = "Hours";              ws.getCell("B1").style = ref.headerLabel;
  ws.getCell("C1").value = "Days";               ws.getCell("C1").style = ref.headerLabel;
  ws.getCell("D1").value = "Daily Rate";         ws.getCell("D1").style = ref.headerLabel;
  ws.getCell("E1").value = "Total";              ws.getCell("E1").style = ref.headerLabel;
  ws.getCell("F1").value = null;                 ws.getCell("F1").style = ref.headerF;
  ws.getCell("G1").value = "HARTS Pay";          ws.getCell("G1").style = ref.headerG;
  ws.getCell("H1").value = "Diff";               ws.getCell("H1").style = ref.headerH;
  ws.getCell("I1").value = "HARTS Profit % Based on Billable Source"; ws.getCell("I1").style = ref.headerI;
  ws.getCell("J1").value = null;                 ws.getCell("J1").style = ref.headerJ;

  // ---- Person + project rows
  let row = 2;
  const personRanges = [];
  let grandRevenue = 0;
  let grandHartsPay = 0;
  people.forEach((person) => {
    let personRevenue = 0;
    for (let col = 1; col <= 10; col++) {
      const cell = ws.getRow(row).getCell(col);
      cell.style = col === 1 ? ref.personA : ref.personOther;
    }
    ws.getCell(row, 1).value = person.name;
    row++;

    const firstProjRow = row;
    person.projects.forEach((proj) => {
      const v = rand(`${person.name}|${proj.name}|${monthSpec.sheet}`);
      const varMul = 0.85 + v * 0.30;
      const newHours = monthSpec.sheet === "May26"
        ? proj.hours
        : round2(proj.hours * monthSpec.monthMul * varMul);

      const days = newHours / 8;
      const total = days * person.rate;
      personRevenue += total;
      ws.getCell(row, 1).value = proj.name;                                              ws.getCell(row, 1).style = ref.projectA;
      ws.getCell(row, 2).value = newHours;                                               ws.getCell(row, 2).style = ref.projectB;
      ws.getCell(row, 3).value = { formula: `B${row}/8`, result: days };                 ws.getCell(row, 3).style = ref.projectC;
      ws.getCell(row, 4).value = person.rate;                                            ws.getCell(row, 4).style = ref.projectD;
      ws.getCell(row, 5).value = { formula: `C${row}*D${row}`, result: total };          ws.getCell(row, 5).style = ref.projectE;
      ws.getCell(row, 6).value = null;                               ws.getCell(row, 6).style = ref.projectF;
      ws.getCell(row, 7).value = null;                               ws.getCell(row, 7).style = ref.projectG;
      ws.getCell(row, 8).value = null;                               ws.getCell(row, 8).style = ref.projectH;
      ws.getCell(row, 9).value = null;                               ws.getCell(row, 9).style = ref.projectI;
      ws.getCell(row, 10).value = null;                              ws.getCell(row, 10).style = ref.projectJ;
      row++;
    });
    const lastProjRow = row - 1;

    ws.getCell(firstProjRow, 6).value = { formula: `SUM(E${firstProjRow}:E${lastProjRow})`, result: personRevenue };
    grandRevenue += personRevenue;
    const inr = HARTS_PAY_INR[person.name];
    if (inr && inr > 0) {
      const hartsPay = inr / 111;
      const diff = personRevenue - hartsPay;
      const profitPct = hartsPay !== 0 ? diff / hartsPay : 0;
      ws.getCell(firstProjRow, 7).value = { formula: `${inr}/111`, result: hartsPay };
      ws.getCell(firstProjRow, 8).value = { formula: `+F${firstProjRow}-G${firstProjRow}`, result: diff };
      ws.getCell(firstProjRow, 9).value = { formula: `H${firstProjRow}/G${firstProjRow}`, result: profitPct };
      grandHartsPay += hartsPay;
    }
    personRanges.push({ name: person.name, firstProjectRow: firstProjRow, lastProjectRow: lastProjRow });
  });

  // ---- Service Fee Total row
  const sft = row;
  for (let col = 1; col <= 10; col++) {
    const cell = ws.getRow(sft).getCell(col);
    if (col === 1) cell.style = ref.totalsA;
    else if (col === 2) cell.style = ref.totalsB;
    else if (col === 3 || col === 4) cell.style = ref.totalsC;
    else if (col === 5) cell.style = ref.totalsE;
    else if (col === 6) cell.style = ref.totalsF;
    else if (col === 7) cell.style = ref.totalsG;
    else if (col === 8) cell.style = ref.totalsH;
    else if (col === 9) cell.style = ref.totalsI;
    else cell.style = ref.totalsJ;
  }
  ws.getCell(sft, 3).value = "Service Fee Total";
  ws.mergeCells(sft, 3, sft, 4);
  const firstDataRow = 2;
  ws.getCell(sft, 5).value = { formula: `SUM(E${firstDataRow}:E${sft - 1})`, result: grandRevenue };
  const gSumParts = personRanges
    .filter((r) => HARTS_PAY_INR[r.name] > 0)
    .map((r) => `G${r.firstProjectRow}`);
  ws.getCell(sft, 7).value = { formula: gSumParts.length ? gSumParts.join("+") : "0", result: grandHartsPay };
  // H = HARTS Pay of NON-billable employees (constant cost line), matching the Old
  // format convention. The dashboard reads this and adds it to total cost.
  const NON_BILLABLE_HARTS_PAY = NON_BILLABLE_INR / 111;
  ws.getCell(sft, 8).value = { formula: `${NON_BILLABLE_INR}/111`, result: NON_BILLABLE_HARTS_PAY };
  const totalProfit = grandRevenue - grandHartsPay - NON_BILLABLE_HARTS_PAY;
  ws.getCell(sft, 9).value = { formula: `(E${sft}-G${sft}-H${sft})/E${sft}`, result: grandRevenue ? totalProfit / grandRevenue : 0 };
  ws.getCell(sft, 6).value = { formula: `SUM(F${firstDataRow}:F${sft - 1})`, result: grandRevenue };
  ws.getCell(sft, 10).value = "Total profit Margin";
  row++;

  // ---- Expense rows
  const expStart = row;
  EXPENSES.forEach((e) => {
    for (let col = 1; col <= 10; col++) {
      ws.getRow(row).getCell(col).style = col === 1 ? ref.expenseA : (col === 5 ? ref.expenseE : ref.projectJ);
    }
    ws.getCell(row, 1).value = e.name;
    ws.getCell(row, 2).value = 0;
    ws.getCell(row, 3).value = 0;
    ws.getCell(row, 4).value = 0;
    ws.getCell(row, 5).value = e.amount;
    row++;
  });
  const expEnd = row - 1;

  // ---- Expenses Total
  const expTotalRow = row;
  for (let col = 1; col <= 10; col++) {
    const cell = ws.getRow(expTotalRow).getCell(col);
    cell.style = col === 3 || col === 4 ? ref.totalsC : (col === 5 ? ref.totalsE : ref.projectJ);
  }
  ws.getCell(expTotalRow, 3).value = "Expenses Total";
  ws.mergeCells(expTotalRow, 3, expTotalRow, 4);
  const expTotal = EXPENSES.reduce((s, e) => s + e.amount, 0);
  ws.getCell(expTotalRow, 5).value = { formula: `SUM(E${expStart}:E${expEnd})`, result: expTotal };
  row++;

  // ---- SUM
  const sumRow = row;
  for (let col = 1; col <= 10; col++) {
    const cell = ws.getRow(sumRow).getCell(col);
    cell.style = col === 3 || col === 4 ? ref.sumLabel : (col === 5 ? ref.sumValue : ref.projectJ);
  }
  ws.getCell(sumRow, 3).value = "SUM";
  ws.mergeCells(sumRow, 3, sumRow, 4);
  const sumValue = grandRevenue + expTotal;
  ws.getCell(sumRow, 5).value = { formula: `E${sft}+E${expTotalRow}`, result: sumValue };
  row++;

  // ---- Tax 19%
  const taxRow = row;
  for (let col = 1; col <= 10; col++) {
    const cell = ws.getRow(taxRow).getCell(col);
    cell.style = col === 3 || col === 4 ? ref.sumLabel : (col === 5 ? ref.sumValue : ref.projectJ);
  }
  ws.getCell(taxRow, 3).value = "Tax 19%";
  ws.mergeCells(taxRow, 3, taxRow, 4);
  const taxValue = sumValue * 0.19;
  ws.getCell(taxRow, 5).value = { formula: `E${sumRow}*19%`, result: taxValue };
  row++;

  // ---- Net Total
  const netRow = row;
  for (let col = 1; col <= 10; col++) {
    const cell = ws.getRow(netRow).getCell(col);
    cell.style = col === 3 || col === 4 ? ref.netLabel : (col === 5 ? ref.netValue : ref.projectJ);
  }
  ws.getCell(netRow, 3).value = "Net Total";
  ws.mergeCells(netRow, 3, netRow, 4);
  ws.getCell(netRow, 5).value = { formula: `E${sumRow}+E${taxRow}`, result: sumValue + taxValue };
}

/* ---------- main ---------- */

(async () => {
  const people = readMay26Data();
  console.log("Loaded", people.length, "people from current May26");

  const styles = await readStyleRefs();
  console.log("Loaded style refs from Old format.xlsx");

  const wb = new ExcelJS.Workbook();
  wb.creator = "EVORA Invoice Pipeline";
  wb.created = new Date();

  MONTHS.forEach((m) => buildSheet(wb, m, people, styles));

  await wb.xlsx.writeFile(OUT_FILE);
  console.log("Wrote", OUT_FILE, "with sheets:", wb.worksheets.map((w) => w.name));
})();
