import { Card } from "../components/ui";

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="max-w-md mx-auto mt-4 sm:mt-8">
      <Card className="p-6 sm:p-10 text-center">
        <div className="text-4xl mb-3">🚧</div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-500 mt-2">Not built yet.</p>
      </Card>
    </div>
  );
}
