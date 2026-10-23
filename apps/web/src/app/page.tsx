import { PROPERTY_TYPES } from '@movein/shared';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">MoveIn</h1>
      <p className="mt-2 text-slate-600">Find your place near campus.</p>
      <ul className="mt-6 flex flex-wrap gap-2">
        {PROPERTY_TYPES.map((type) => (
          <li key={type.id} className="rounded-full border border-slate-300 px-3 py-1 text-sm">
            {type.label}
          </li>
        ))}
      </ul>
    </main>
  );
}
