import { HostFlowApp } from "@/components/hostflow/app";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <HostFlowApp
      page="properties"
      propertyView="edit"
      propertyId={id}
      propertyStartPhotos={query.step === "photos"}
    />
  );
}
