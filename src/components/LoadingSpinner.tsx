export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full" />
      </div>
      <p className="ml-4 text-gray-600 dark:text-muted-foreground">Loading...</p>
    </div>
  );
}
