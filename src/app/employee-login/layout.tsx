import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login Karyawan | Zona Waktu",
};

export default function EmployeeLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
