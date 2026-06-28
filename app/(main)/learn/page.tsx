import LearnDashboard from '@/components/learn/LearnDashboard';
import { LESSONS } from '@/lib/learn-curriculum';

export default function LearnPage() {
  return <LearnDashboard lessons={LESSONS} />;
}
