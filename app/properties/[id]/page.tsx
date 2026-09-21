import { HostFlowApp } from "@/components/hostflow/app";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <HostFlowApp page="properties" propertyView="detail" propertyId={id} />
  );
}
