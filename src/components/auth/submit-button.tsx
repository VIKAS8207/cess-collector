import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SubmitButton({
  loading,
  disabled,
  children,
  loadingLabel,
}: {
  loading: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  loadingLabel?: string;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full"
      disabled={loading || disabled}
      aria-busy={loading}
    >
      {loading && <Spinner />}
      {loading ? (loadingLabel ?? children) : children}
    </Button>
  );
}
