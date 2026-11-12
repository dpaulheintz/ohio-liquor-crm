// Read-only notes for accounting: what was wrong in the old OHLQ requisition spreadsheet, so the new
// totals can be trusted.
export default function OldSpreadsheetNotesPage() {
  const items: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Small Batch Bourbon (7010B) was counted twice in “DSP Sales”',
      body: <>The DSP Sales formula added the 7010B column twice, overstating it by <b>$21,685.80</b>.</>,
    },
    {
      title: 'Whiskey War 1 L (6928L) had no price columns',
      body: <>All <b>300 bottles</b> of 6928L were counted as <b>$0</b>. They’re now priced from the OHLQ file ($33.89 paid per bottle).</>,
    },
    {
      title: 'Some sheet prices didn’t match the OHLQ product file',
      body: <>(614) Vodka 1 L, High Bank Vodka 750 mL and 1 L, Vodka 200 mL, Statehouse Gin and Professor Rum used typed-in prices that differed from OHLQ. Every price now comes from the OHLQ file (the gold standard), rounded to the cent per bottle before multiplying by bottles.</>,
    },
    {
      title: 'The totals row stopped at row 484',
      body: <>The totals only summed rows 2–484, so the last ~120 entries were missing from the sheet’s own totals.</>,
    },
    {
      title: 'Bottom line (FY2026, dated rows)',
      body: <>Old sheet DSP total <b>$1,422,198.67</b> vs. new <b>$1,412,403.76</b>. Bottle counts (32,237 in total, and every month, location and type) matched the control totals checked at import, to the bottle.</>,
    },
    {
      title: 'Entry count',
      body: <>The old sheet had 603 rows; some were separate rows for the same date, location and type. The cleaned import file had no row numbers, so those were combined into one entry each: <b>568 entries</b> (2,164 SKU lines). Totals are unaffected.</>,
    },
  ];
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Read-only. What we found when moving the FY2026 OHLQ requisition spreadsheet into Bottle Sales, and why the new totals differ.
      </p>
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{it.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{it.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
