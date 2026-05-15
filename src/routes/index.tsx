import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MeduxLogo } from "@/components/MeduxLogo";
import { Phone, Video, Shield, Zap, Users, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Medux — Connect. Clearly." },
      { name: "description", content: "Professional real-time video and voice calling. Crystal-clear quality, end-to-end encrypted, beautifully simple." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Floating orbs */}
      <div className="orb absolute -top-20 -left-20 h-96 w-96" style={{ background: "oklch(0.52 0.22 285 / 0.5)" }} />
      <div className="orb absolute top-40 right-0 h-80 w-80" style={{ background: "oklch(0.66 0.16 230 / 0.5)", animationDelay: "5s" }} />
      <div className="orb absolute bottom-0 left-1/3 h-96 w-96" style={{ background: "oklch(0.52 0.22 285 / 0.4)", animationDelay: "10s" }} />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/"><MeduxLogo showText size={32} /></Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground transition">Features</a>
          <a href="#pricing" className="hover:text-foreground transition">Pricing</a>
          <Link to="/login" className="hover:text-foreground transition">Sign in</Link>
        </nav>
        <Link to="/signup" className="rounded-full gradient-brand px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:scale-105 active:scale-95">
          Get started
        </Link>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-24 text-center md:pt-28">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Real-time WebRTC · End-to-end secure
          </span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-6 font-['Space_Grotesk'] text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl"
        >
          Connect. <span className="text-gradient">Clearly.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
        >
          Medux is the modern way to make video and voice calls. Beautifully designed,
          deliciously fast, and built for teams who care about quality.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link to="/signup" className="rounded-full gradient-brand px-7 py-3.5 text-base font-semibold text-white shadow-glow transition hover:scale-105 active:scale-95">
            Get started free
          </Link>
          <Link to="/login" className="rounded-full glass px-7 py-3.5 text-base font-semibold transition hover:scale-105">
            Sign in
          </Link>
        </motion.div>

        {/* Floating mockup */}
        <motion.div
          initial={{ opacity: 0, y: 60, rotateX: 25 }}
          animate={{ opacity: 1, y: 0, rotateX: 8 }}
          transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
          className="relative mx-auto mt-20 aspect-video max-w-4xl rounded-3xl glass p-3 shadow-glow"
          style={{ perspective: 1000, transformStyle: "preserve-3d" }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-secondary/20 to-primary/30">
            <div className="absolute inset-0" style={{ background: "var(--gradient-glow)" }} />
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3">
              {[0,1,2,3,4].map((i) => (
                <button key={i} className="grid h-12 w-12 place-items-center rounded-full glass shadow-card">
                  <div className="h-5 w-5 rounded-full bg-primary/70" />
                </button>
              ))}
              <button className="grid h-12 w-12 place-items-center rounded-full bg-destructive shadow-glow">
                <Phone className="h-5 w-5 rotate-[135deg] text-white" />
              </button>
            </div>
            <div className="absolute right-6 top-6 h-32 w-44 rounded-xl bg-background/80 ring-1 ring-border" />
          </div>
        </motion.div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center font-['Space_Grotesk'] text-3xl font-bold md:text-5xl">
          Everything you need. <span className="text-gradient">Nothing you don't.</span>
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            { icon: Video, title: "HD Video Calls", body: "Crystal-clear 1080p video with adaptive bitrate." },
            { icon: Phone, title: "Voice Mode", body: "Bandwidth-light voice calls with noise suppression." },
            { icon: Users, title: "Smart Contacts", body: "Friend requests, presence, and instant call-back." },
            { icon: Shield, title: "Secure by Default", body: "WebRTC peer-to-peer with TLS-secured signaling." },
            { icon: Zap, title: "Lightning Fast", body: "Sub-second connect time, anywhere in the world." },
            { icon: Sparkles, title: "Beautifully Crafted", body: "Pixel-perfect interface with delightful motion." },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.05 }}
              className="rounded-2xl glass p-6 shadow-card transition hover:scale-[1.02] hover:shadow-glow"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl gradient-brand text-white">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center font-['Space_Grotesk'] text-3xl font-bold md:text-5xl">Simple pricing</h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            { name: "Free", price: "$0", body: "Unlimited 1:1 calls", cta: "Get started", popular: false },
            { name: "Pro", price: "$8", body: "Group calls + recording", cta: "Start trial", popular: true },
            { name: "Enterprise", price: "Custom", body: "SSO, audit, support", cta: "Contact us", popular: false },
          ].map((p) => (
            <div key={p.name} className={`rounded-2xl glass p-8 shadow-card ${p.popular ? "ring-2 ring-primary shadow-glow" : ""}`}>
              {p.popular && <div className="mb-3 inline-block rounded-full gradient-brand px-3 py-1 text-xs font-semibold text-white">POPULAR</div>}
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <div className="mt-4 text-4xl font-bold">{p.price}<span className="text-base font-normal text-muted-foreground">/mo</span></div>
              <p className="mt-3 text-sm text-muted-foreground">{p.body}</p>
              <Link to="/signup" className={`mt-6 block rounded-full px-5 py-2.5 text-center text-sm font-semibold transition hover:scale-[1.02] ${p.popular ? "gradient-brand text-white shadow-glow" : "glass"}`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border px-6 py-10 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2"><MeduxLogo size={24} /> © 2026 Medux</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
