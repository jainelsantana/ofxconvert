import { OfxConverter } from "@/components/ofx-converter";

export default function Home() {
  return (
    <main className="page-bg w-full relative flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-hidden">
      <div className="w-full py-8 flex flex-col items-center justify-center">
        <OfxConverter />
      </div>
    </main>
  );
}
