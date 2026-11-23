import type { Metadata } from "next";
import { AgencyAdmin } from "@/components/agency-admin";
import "./admin.css";
export const metadata: Metadata = { title: "K-ROAD | 기관 관리", robots: { index: false, follow: false } };
export default function AdminPage() { return <AgencyAdmin/>; }
