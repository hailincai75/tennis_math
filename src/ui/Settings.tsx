import { StatusCard } from './StatusCard';

export function Settings({ offlineReady }: { offlineReady: boolean }) {
  return (
    <main>
      <StatusCard offlineReady={offlineReady} />
    </main>
  );
}
