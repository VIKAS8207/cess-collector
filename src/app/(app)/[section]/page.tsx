import { notFound } from "next/navigation";
import { ConstructionIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { findPage, isKnownSection, sectionSlugs } from "@/components/app/nav-config";

// Gated client-side (frontend-only auth): the page renders after sign-in is
// known, so opt out of instant-navigation validation until a real session exists.
export const instant = false;

export function generateStaticParams() {
  return sectionSlugs.map((section) => ({ section }));
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isKnownSection(section)) notFound();
  const title = findPage(`/${section}`)?.item.label ?? section;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg text-foreground">{title}</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ConstructionIcon aria-hidden="true" className="size-8 text-primary" />
          <p className="text-body-md text-muted-foreground">
            This page is not built yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
