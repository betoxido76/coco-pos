// Marca "soma ops" (familia SOMA). Un solo lugar para el ícono, el wordmark y la
// pantalla de acceso (login, recuperar y nueva contraseña).
//
// - Colores y tipografía del manual de SOMA (soma-wiki/wiki/pages/gtm/identidad-visual.md):
//   azul noche #0F1F3D, teal #00BFA5, ámbar #E8A838, Inter ExtraBold en minúsculas.
// - Ícono "Núcleo": el anillo de SOMA (rect rx22, anillo r27 trazo 12) con un centro
//   sólido. Las PNG de public/ (icon-*.png, apple-touch-icon.png) y public/favicon.svg
//   son esta misma figura: si cambia aquí, regenerarlas.
export const MARCA = {
    nombre: 'soma ops',
    frase: 'Del pedido al cobro, en un solo lugar.',
    navy: '#0F1F3D',
    teal: '#00BFA5',
    amber: '#E8A838',
    slate: '#475569',
    slateClaro: '#94A3B8',
    fuente: "'Inter', 'Helvetica Neue', Arial, sans-serif",
}

// variante 'oscuro' = fondo azul noche (app, favicon); 'claro' = fondo blanco
export function IconoSomaOps({ size = 32, variante = 'oscuro', titulo }) {
    const oscuro = variante === 'oscuro'
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" role={titulo ? 'img' : undefined}
            aria-label={titulo} aria-hidden={titulo ? undefined : true} style={{ flex: 'none', display: 'block' }}>
            {oscuro
                ? <rect width="100" height="100" rx="22" fill={MARCA.navy} />
                : <rect x="1" y="1" width="98" height="98" rx="21" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />}
            <circle cx="50" cy="50" r="27" fill="none" stroke={oscuro ? MARCA.teal : MARCA.navy} strokeWidth="12" />
            <circle cx="50" cy="50" r="9" fill={oscuro ? MARCA.amber : MARCA.teal} />
        </svg>
    )
}

// "soma ops": soma en ExtraBold con la o de acento; ops en peso medio.
// sobreOscuro = texto blanco con la o ámbar (variante oscura del manual de SOMA).
export function WordmarkSomaOps({ size = 18, sobreOscuro = false }) {
    const base = sobreOscuro ? '#FFFFFF' : MARCA.navy
    const o = sobreOscuro ? MARCA.amber : MARCA.teal
    const ops = sobreOscuro ? MARCA.slateClaro : MARCA.slate
    return (
        <span style={{ fontFamily: MARCA.fuente, fontSize: size, lineHeight: 1, letterSpacing: '-0.03em', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'baseline', gap: '0.22em' }}>
            <span style={{ fontWeight: 800, color: base }}>s<span style={{ color: o }}>o</span>ma</span>
            <span style={{ fontWeight: 500, color: ops, letterSpacing: '-0.02em' }}>ops</span>
        </span>
    )
}

export function LogoSomaOps({ size = 18, sobreOscuro = false }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.45) }} aria-label={MARCA.nombre}>
            {/* El ícono va siempre en su versión azul noche: se lee igual sobre blanco y sobre oscuro */}
            <IconoSomaOps size={Math.round(size * 1.45)} />
            <WordmarkSomaOps size={size} sobreOscuro={sobreOscuro} />
        </span>
    )
}

// Pantalla de acceso: panel de marca (azul noche con la trama de puntos del manual
// de SOMA) + tarjeta con el formulario. En pantallas angostas el panel pasa arriba.
export function PantallaAcceso({ titulo, subtitulo, children }) {
    return (
        <div className="acceso">
            <style>{`
                .acceso { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); background: #F8F9FC; font-family: ${MARCA.fuente}; }
                .acceso-marca { background-color: ${MARCA.navy}; background-image: radial-gradient(circle, #22345A 1.2px, transparent 1.2px); background-size: 22px 22px;
                    padding: 48px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; }
                .acceso-frase { color: #FFFFFF; font-size: 34px; font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; margin: 0; max-width: 14ch; }
                .acceso-pie { color: ${MARCA.slateClaro}; font-size: 13px; }
                .acceso-form { display: flex; align-items: center; justify-content: center; padding: 32px 20px; }
                .acceso-tarjeta { width: 100%; max-width: 380px; }
                @media (max-width: 820px) {
                    .acceso { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
                    .acceso-marca { padding: 24px 20px; gap: 14px; }
                    .acceso-frase { font-size: 20px; max-width: none; }
                    .acceso-pie { display: none; }
                    .acceso-form { align-items: flex-start; padding-top: 28px; }
                }
            `}</style>
            <div className="acceso-marca">
                <LogoSomaOps size={30} sobreOscuro />
                <p className="acceso-frase">{MARCA.frase}</p>
                <span className="acceso-pie">Parte de la familia SOMA</span>
            </div>
            <div className="acceso-form">
                <div className="acceso-tarjeta">
                    {titulo && <h1 style={{ fontSize: 24, fontWeight: 800, color: MARCA.navy, margin: 0, letterSpacing: '-0.01em' }}>{titulo}</h1>}
                    {subtitulo && <p style={{ fontSize: 14, color: MARCA.slate, margin: '6px 0 0' }}>{subtitulo}</p>}
                    <div style={{ marginTop: titulo || subtitulo ? 28 : 0 }}>{children}</div>
                </div>
            </div>
        </div>
    )
}
