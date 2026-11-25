import Dashboard from './components/Dashboard';
import { getDashboardState } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const state = await getDashboardState();
  return <Dashboard initial={state} />;
}
