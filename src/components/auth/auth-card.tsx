import { Card } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-[420px] gap-6 p-0 [--card-spacing:--spacing(8)]">
      <div className="flex flex-col gap-6 p-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-md text-foreground">{title}</h1>
          {description && (
            <p className="text-body-md text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </div>
    </Card>
  );
}
