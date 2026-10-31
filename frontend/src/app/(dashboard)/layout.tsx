import { CurrentUserProvider } from "@/components/current-user";
import { MobileNav, Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CurrentUserProvider>
      <div className="min-h-screen bg-background md:flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav />
          <main className="flex-1">
            <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">{children}</div>
          </main>
        </div>
      </div>
    </CurrentUserProvider>
  );
}
