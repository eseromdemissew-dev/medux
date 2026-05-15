import { ReactNode } from "react";
import { motion } from "framer-motion";
import { MeduxLogo } from "@/components/MeduxLogo";
import { Link } from "@tanstack/react-router";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div className="orb absolute -top-20 -left-20 h-96 w-96" style={{ background: "oklch(0.52 0.22 285 / 0.55)" }} />
      <div className="orb absolute bottom-0 right-0 h-96 w-96" style={{ background: "oklch(0.66 0.16 230 / 0.55)", animationDelay: "6s" }} />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md rounded-3xl glass p-8 shadow-glow"
      >
        <Link to="/" className="mb-6 flex justify-center"><MeduxLogo size={48} showText /></Link>
        <h1 className="text-center font-['Space_Grotesk'] text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-7">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </motion.div>
    </div>
  );
}
