import { getAgencies, getProducts, getSetting, getTasting } from '@/lib/ohlq-demo/server';
import { TastingForm, type ApplicantProfile } from '@/components/ohlq-demo/tasting-form';

export default async function NewTastingPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const [agencies, products, profile, source] = await Promise.all([
    getAgencies(), getProducts(), getSetting<ApplicantProfile>('applicant_profile', {}), from ? getTasting(from) : Promise.resolve(null),
  ]);
  return <TastingForm key={from ?? 'new'} agencies={agencies} products={products} profile={profile} from={source} />;
}
