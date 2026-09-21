import { HostFlowApp } from "@/components/hostflow/app";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <HostFlowApp
      page="reservations"
      reservationView="edit"
      reservationId={(await params).id}
    />
  );
}
