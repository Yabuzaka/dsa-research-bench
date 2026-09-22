export function AppErrorComponent({ error }: { error: Error }) {
  return (
    <div className="p-6 text-sm">
      <p className="font-medium">Something went wrong</p>
      <pre className="mt-2 whitespace-pre-wrap text-muted">{error.message}</pre>
    </div>
  );
}
