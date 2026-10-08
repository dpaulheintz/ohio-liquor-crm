import type { Metadata } from 'next';
import { SecretShopperForm } from './secret-shopper-form';

// Deliberately generic title: the shopper's phone may be visible to staff.
export const metadata: Metadata = {
  title: 'Restaurant Review | High Bank',
  robots: { index: false, follow: false },
};

export default function SecretShopperPage() {
  return <SecretShopperForm />;
}
