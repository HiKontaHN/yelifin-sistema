"use client";

import { useState, type ReactNode } from "react";
import { DollarSign, FileText, Hash, ImageIcon, PackagePlus, ToggleLeft, UserPlus, X } from "lucide-react";

const slides = [
  {
    title: "Registra tu inventario",
    subtitle: "Crea productos y servicios",
    gradient: "bg-[linear-gradient(145deg,#0068ff_0%,#2f85ff_44%,#eff7ff_100%)]",
    art: "inventory",
    modal: <ProductDemoModal />,
  },
  {
    title: "Registra tus clientes",
    subtitle: "o usa uno anónimo",
    gradient: "bg-[linear-gradient(145deg,#a85df5_0%,#b77af7_52%,#f3e7ff_100%)]",
    art: "customers",
    modal: <CustomerDemoModal />,
  },
];

export function LandingFlow() {
  return (
    <section id="como-funciona" className="bg-white px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <span className="inline-flex items-center rounded-full bg-[#8cff00] px-4 py-1 text-sm font-bold text-black">
            ¿Cómo funciona?
          </span>
          <h2 className="mt-4 text-3xl font-normal text-black sm:text-4xl">
            Tu día con Konta se verá así
          </h2>
        </div>

        <div className="-mx-5 mt-10 overflow-x-auto px-5 pb-5 [scrollbar-width:none] sm:-mx-8 sm:px-8">
          <div className="mx-auto flex w-max snap-x snap-mandatory gap-6 lg:w-full lg:max-w-6xl lg:gap-8">
            {slides.map((slide) => (
              <article
                key={slide.title}
                className={`relative h-[680px] w-[min(88vw,540px)] snap-center overflow-hidden rounded-xl ${slide.gradient} px-4 pt-8 sm:px-8 lg:h-[720px] lg:flex-1`}
              >
                <SlideArt type={slide.art} />
                <div className="relative z-10 text-center text-white">
                  <h3 className="text-2xl font-bold leading-tight sm:text-4xl">{slide.title}</h3>
                  <p className="mt-2 text-sm text-white/85 sm:text-lg">{slide.subtitle}</p>
                </div>
                <div className="relative z-10 mx-auto mt-6 w-full max-w-lg sm:mt-7">
                  {slide.modal}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoModal({ title, icon, children, action, footerNote }: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action: string;
  footerNote?: string;
}) {
  return (
    <div className="mx-auto flex max-h-[520px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:max-h-[550px] xl:max-w-lg">
      <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="flex items-center gap-2 text-base font-bold sm:text-lg">
          <span className="text-[#0068ff]">{icon}</span>
          {title}
        </div>
        <button type="button" aria-label="Cerrar demo" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 [scrollbar-width:thin] sm:px-5">{children}</div>
      <div className="flex shrink-0 gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
        <button type="button" className="h-11 flex-1 rounded-md border border-slate-200 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="button" className="h-11 flex-1 rounded-md bg-[#2f80ed] text-sm font-bold text-white hover:bg-[#1d6fe0]">
          {action}
        </button>
      </div>
      {footerNote && <p className="shrink-0 px-4 pb-4 text-xs text-slate-400 sm:px-5">{footerNote}</p>}
    </div>
  );
}

function ProductDemoModal() {
  const [isService, setIsService] = useState(false);

  return (
    <DemoModal
      title={isService ? "Nuevo servicio" : "Nuevo producto"}
      icon={<PackagePlus className="size-5" />}
      action={isService ? "Crear servicio" : "Crear producto"}
      footerNote="Demo visual: no guarda información ni llama endpoints."
    >
      <button
        type="button"
        onClick={() => setIsService((value) => !value)}
        className={`flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-left transition ${
          isService ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <ToggleLeft className={isService ? "mt-0.5 size-5 text-[#0068ff]" : "mt-0.5 size-5 text-slate-400"} />
          <div>
            <p className="text-sm font-medium leading-none text-slate-900">Es un servicio</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Actívalo si vendes mantenimiento, instalación o asesoría. Los servicios no descuentan inventario.
            </p>
          </div>
        </div>
        <span className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${isService ? "bg-[#0068ff]" : "bg-slate-300"}`}>
          <span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${isService ? "left-6" : "left-1"}`} />
        </span>
      </button>

      <Field label="Imagen" optional icon={<ImageIcon className="size-3.5" />}>
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center hover:bg-slate-100 sm:min-h-36">
          <ImageIcon className="size-7 text-slate-400" />
          <span className="mt-2 text-sm font-semibold text-slate-600">Toca o arrastra una imagen</span>
          <span className="mt-1 text-xs text-slate-400">PNG, JPG, WebP hasta 5 MB</span>
          <input type="file" className="sr-only" />
        </label>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Nombre" required placeholder={isService ? "Ej: Instalación de sistema" : "Ej: Camiseta negra talla M"} icon={<FileText className="size-3.5" />} />
        <TextInput label="SKU" required={!isService} optional={isService} placeholder={isService ? "SERV-001" : "CAM-NEG-M"} icon={<Hash className="size-3.5" />} />
        <TextInput label="Precio de venta" required placeholder="0.00" prefix="HNL" icon={<DollarSign className="size-3.5" />} />
        <TextInput label="Código de barras" optional placeholder="7501031311309" />
      </div>

      <TextareaInput label="Descripción" optional placeholder={isService ? "Describe el servicio..." : "Describe el producto brevemente..."} />
    </DemoModal>
  );
}

function CustomerDemoModal() {
  return (
    <DemoModal title="Nuevo cliente" icon={<UserPlus className="size-5" />} action="Crear cliente" footerNote="Demo visual: puedes escribir, pero no se guarda información.">
      <TextInput label="Nombre" required placeholder="Ej: Andrea López" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Teléfono" optional placeholder="+504 9999-9999" />
        <TextInput label="Email" optional type="email" placeholder="correo@email.com" />
      </div>
      <TextareaInput label="Notas" optional placeholder="Observaciones del cliente..." />
    </DemoModal>
  );
}

function Field({ label, children, icon, required, optional }: {
  label: string;
  children: ReactNode;
  icon?: ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
        {icon && <span className="text-slate-500">{icon}</span>}
        {label}
        {required && <span className="text-xs text-red-500">*</span>}
        {optional && <span className="text-xs font-normal text-slate-500">opcional</span>}
      </span>
      {children}
    </label>
  );
}

function TextInput({ label, placeholder, icon, required, optional, type = "text", prefix }: {
  label: string;
  placeholder?: string;
  icon?: ReactNode;
  required?: boolean;
  optional?: boolean;
  type?: string;
  prefix?: string;
}) {
  return (
    <Field label={label} icon={icon} required={required} optional={optional}>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{prefix}</span>}
        <input
          type={type}
          placeholder={placeholder}
          className={`h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0068ff] focus:ring-2 focus:ring-blue-100 ${prefix ? "pl-12" : ""}`}
        />
      </div>
    </Field>
  );
}

function TextareaInput({ label, placeholder, optional }: { label: string; placeholder?: string; optional?: boolean }) {
  return (
    <Field label={label} optional={optional}>
      <textarea
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0068ff] focus:ring-2 focus:ring-blue-100"
      />
    </Field>
  );
}

function SlideArt({ type }: { type: string }) {
  if (type === "inventory") {
    return (
      <>
        <div className="absolute -bottom-16 -left-14 h-48 w-48 rotate-45 rounded-3xl border-[22px] border-white/24" />
        <div className="absolute right-16 top-24 h-48 w-48 rotate-[30deg] rounded-2xl border-[18px] border-blue-200/45" />
      </>
    );
  }

  return (
    <>
      <div className="absolute -left-10 top-8 text-[220px] font-bold leading-none text-white/12 sm:text-[260px]">8</div>
      <div className="absolute -right-10 bottom-16 size-36 rounded-full border-[18px] border-white/18" />
      <div className="absolute right-24 top-9 size-14 rotate-45 rounded-lg bg-white/18" />
    </>
  );
}
