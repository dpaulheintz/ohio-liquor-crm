import { getSalesHealth } from '@/app/actions/sales';
import { SalesUploadClient } from './sales-upload-client';

export const metadata = { title: 'Sales Upload' };

export default async function SalesUploadPage() {
  let health;
  try {
    health = await getSalesHealth();
  } catch {
    health = { months: [], gaps: [], unknownCodes: {}, lastMonth: null };
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-1">
      <h1 className="text-xl font-semibold">Sales Upload</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Upload monthly sales and wholesale CSVs. Data is upserted — re-uploading a month is safe.
      </p>
      <SalesUploadClient health={health} />
    </div>
  );
}
