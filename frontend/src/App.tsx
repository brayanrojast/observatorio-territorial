import { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';
import { toPng } from 'html-to-image';
import {
  Download,
  Camera,
  Plus,
  Minus,
  RotateCcw,
  X,
} from 'lucide-react';

interface IndicadorMeta {
  indicador: string;
  unidad: string;
}

interface SerieItem {
  anio: number;
  valor: number | null;
  unidad?: string;
}

interface SerieCargada {
  etiqueta: string;
  unidad: string;
  datos: SerieItem[];
}

interface FichaData {
  region: string;
  anio: number;
  dataset: string;
  indicadores: { indicador: string; valor: number | null; unidad: string }[];
}

const COLOR_1 = '#1e3a8a';
const COLOR_2 = '#b91c1c';
const COLOR_3 = '#047857';
const COLOR_PROMEDIO = '#64748b';

export default function App() {
  const chartRef = useRef<HTMLDivElement>(null);
  const cacheConsultas = useRef<Map<string, SerieItem[]>>(new Map());

  // Estados Base
  const [datasets, setDatasets] = useState<string[]>([]);
  const [datasetSel, setDatasetSel] = useState<string>('empleo_geih');
  const [regiones, setRegiones] = useState<string[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadorMeta[]>([]);

  // Vistas y Modos
  const [vistaActiva, setVistaActiva] = useState<'grafica' | 'mapa'>('grafica');
  const [modo, setModo] = useState<'modoA' | 'modoB'>('modoA');

  // Modo A
  const [indFijo, setIndFijo] = useState<string>('');
  const [regA1, setRegA1] = useState<string>('');
  const [regA2, setRegA2] = useState<string>('');
  const [regA3, setRegA3] = useState<string>('');

  // Modo B
  const [regFija, setRegFija] = useState<string>('');
  const [indB1, setIndB1] = useState<string>('');
  const [indB2, setIndB2] = useState<string>('');

  // Series y Estado de Carga
  const [series, setSeries] = useState<SerieCargada[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Rango de Años y Promedio
  const [rangoAnios, setRangoAnios] = useState<{ min: number; max: number }>({ min: 2007, max: 2025 });
  const [limitesDataset, setLimitesDataset] = useState<{ min: number; max: number }>({ min: 2007, max: 2025 });
  const [mostrarPromedio, setMostrarPromedio] = useState<boolean>(false);
  const [seriePromedio, setSeriePromedio] = useState<Record<number, number>>({});

  // Mapa
  const [mapGeoData, setMapGeoData] = useState<any>(null);
  const [anioMapa, setAnioMapa] = useState<number>(2023);
  const [indMapa, setIndMapa] = useState<string>('');
  const [datosMapa, setDatosMapa] = useState<Record<string, number>>({});
  const [loadingMapa, setLoadingMapa] = useState<boolean>(false);
  const [zoomPosition, setZoomPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: [-73.5, 4.2],
    zoom: 1,
  });
  const [tooltipInfo, setTooltipInfo] = useState<{
    nombre: string;
    valor: number | null;
    x: number;
    y: number;
    fijado: boolean;
  } | null>(null);

  // Ficha Modal
  const [fichaModal, setFichaModal] = useState<FichaData | null>(null);
  const [loadingFicha, setLoadingFicha] = useState<boolean>(false);

  // 1. Cargar GeoJSON
  useEffect(() => {
    fetch('/colombia.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMapGeoData(data);
      })
      .catch((err) => console.error('Error mapa:', err));
  }, []);

  // 2. Cargar Datasets
  useEffect(() => {
    fetch('/api/datasets')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setDatasets(data);
          setDatasetSel(data[0]);
        }
      })
      .catch((err) => console.error('Error datasets:', err));
  }, []);

  // 3. Metadata Dataset Principal
  useEffect(() => {
    if (!datasetSel) return;
    fetch(`/api/metadata?dataset=${datasetSel}`)
      .then((res) => (res.ok ? res.json() : { regiones: [], indicadores: [] }))
      .then((data) => {
        const regs: string[] = data.regiones || [];
        const inds: IndicadorMeta[] = data.indicadores || [];

        setRegiones(regs);
        setIndicadores(inds);

        if (inds.length > 0) {
          setIndFijo(inds[0].indicador);
          setIndMapa(inds[0].indicador);
          setIndB1(inds[0].indicador);
          setIndB2(inds[1]?.indicador || '');
        }
        if (regs.length > 0) {
          setRegA1(regs[0]);
          setRegA2(regs[1] || '');
          setRegA3(regs[2] || '');
          setRegFija(regs[0]);
        }
      })
      .catch((err) => console.error('Error metadata:', err));
  }, [datasetSel]);

  // Función Cached de Datos
  const consultarSerieCached = async (dataset: string, region: string, indicador: string): Promise<SerieItem[]> => {
    const key = `${dataset}__${region}__${indicador}`;
    if (cacheConsultas.current.has(key)) {
      return cacheConsultas.current.get(key)!;
    }
    try {
      const url = `/api/datos?dataset=${dataset}&region=${encodeURIComponent(region)}&indicador=${encodeURIComponent(indicador)}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data: SerieItem[] = await res.json();
      cacheConsultas.current.set(key, data);
      return data;
    } catch {
      return [];
    }
  };

  // 4. Cargar Series para la Gráfica
  useEffect(() => {
    if (!datasetSel || vistaActiva !== 'grafica') return;

    let peticiones: { etiqueta: string; dataset: string; region: string; indicador: string }[] = [];

    if (modo === 'modoA') {
      if (!indFijo) return;
      const seleccionadas = [regA1, regA2, regA3].filter(Boolean);
      peticiones = seleccionadas.map((r) => ({ etiqueta: r, dataset: datasetSel, region: r, indicador: indFijo }));
    } else {
      if (!regFija) return;
      const seleccionados = [indB1, indB2].filter(Boolean);
      peticiones = seleccionados.map((i) => ({ etiqueta: i, dataset: datasetSel, region: regFija, indicador: i }));
    }

    if (peticiones.length === 0) {
      setSeries([]);
      return;
    }

    setLoading(true);

    Promise.all(
      peticiones.map(async (p) => {
        const items = await consultarSerieCached(p.dataset, p.region, p.indicador);
        const unidad = items.length > 0 && items[0].unidad ? items[0].unidad : '';
        return { etiqueta: p.etiqueta, unidad, datos: items };
      })
    ).then((res) => {
      setSeries(res);
      setLoading(false);

      const todosLosAnios = res.flatMap((s) => s.datos.map((d) => d.anio));
      if (todosLosAnios.length > 0) {
        const minA = Math.min(...todosLosAnios);
        const maxA = Math.max(...todosLosAnios);
        setLimitesDataset({ min: minA, max: maxA });
        setRangoAnios({ min: minA, max: maxA });
      }
    });
  }, [vistaActiva, modo, datasetSel, indFijo, regA1, regA2, regA3, regFija, indB1, indB2]);

  // 5. Promedio Nacional
  useEffect(() => {
    if (!datasetSel || !indFijo || regiones.length === 0) return;

    Promise.all(regiones.map((r) => consultarSerieCached(datasetSel, r, indFijo))).then((todasLasSeries) => {
      const mapaAgregado: Record<number, { suma: number; count: number }> = {};
      todasLasSeries.flat().forEach((it) => {
        if (it.valor !== null && it.valor !== undefined) {
          if (!mapaAgregado[it.anio]) mapaAgregado[it.anio] = { suma: 0, count: 0 };
          mapaAgregado[it.anio].suma += it.valor;
          mapaAgregado[it.anio].count += 1;
        }
      });
      const promedios: Record<number, number> = {};
      Object.entries(mapaAgregado).forEach(([anio, agg]) => {
        promedios[Number(anio)] = Number((agg.suma / agg.count).toFixed(2));
      });
      setSeriePromedio(promedios);
    });
  }, [datasetSel, indFijo, regiones]);

  // 6. Formato Recharts para Series
  const { lineasActivas, datosGrafico } = useMemo(() => {
    const mapaAnio: Record<number, Record<string, any>> = {};
    const lineas = series.map((s) => s.etiqueta);

    series.forEach((s) => {
      s.datos.forEach((d) => {
        if (d.anio >= rangoAnios.min && d.anio <= rangoAnios.max) {
          if (!mapaAnio[d.anio]) mapaAnio[d.anio] = { anio: d.anio };
          mapaAnio[d.anio][s.etiqueta] = d.valor;
        }
      });
    });

    if (mostrarPromedio && modo === 'modoA') {
      Object.keys(mapaAnio).forEach((anioStr) => {
        const a = Number(anioStr);
        if (seriePromedio[a] !== undefined) {
          mapaAnio[a]['Promedio Nacional'] = seriePromedio[a];
        }
      });
    }

    const ordenados = Object.values(mapaAnio).sort((a, b) => a.anio - b.anio);
    return { lineasActivas: lineas, datosGrafico: ordenados };
  }, [series, rangoAnios, mostrarPromedio, modo, seriePromedio]);

  // KPIs
  const kpis = useMemo(() => {
    if (!series[0] || series[0].datos.length === 0) return null;
    const datosFiltrados = series[0].datos.filter(
      (d) => d.valor !== null && d.anio >= rangoAnios.min && d.anio <= rangoAnios.max
    );
    if (datosFiltrados.length === 0) return null;

    const primerDato = datosFiltrados[0].valor || 0;
    const ultimoRegistro = datosFiltrados[datosFiltrados.length - 1];
    const ultimoDato = ultimoRegistro.valor || 0;
    const maximo = Math.max(...datosFiltrados.map((d) => d.valor || 0));
    const cambioPct =
      primerDato !== 0 ? (((ultimoDato - primerDato) / primerDato) * 100).toFixed(1) : '0';

    return {
      serie: series[0].etiqueta,
      ultimoAnio: ultimoRegistro.anio,
      ultimoValor: ultimoDato,
      maximo,
      cambioPct,
    };
  }, [series, rangoAnios]);

  // Carga Mapa
  useEffect(() => {
    if (vistaActiva !== 'mapa' || !datasetSel || !indMapa || regiones.length === 0) return;

    const timer = setTimeout(() => {
      setLoadingMapa(true);
      Promise.all(
        regiones.map(async (reg) => {
          const data = await consultarSerieCached(datasetSel, reg, indMapa);
          const punto = data.find((d) => d.anio === anioMapa);
          return { region: reg, valor: punto ? punto.valor : null };
        })
      ).then((resultados) => {
        const mapaValores: Record<string, number> = {};
        resultados.forEach((r) => {
          if (r.valor !== null && r.valor !== undefined) {
            const cleanKey = r.region.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            mapaValores[cleanKey] = r.valor;
          }
        });
        setDatosMapa(mapaValores);
        setLoadingMapa(false);
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [vistaActiva, datasetSel, indMapa, anioMapa, regiones]);

  const { escalaColor } = useMemo(() => {
    const valores = Object.values(datosMapa);
    if (valores.length === 0) return { escalaColor: () => '#e2e8f0' };
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    return {
      escalaColor: scaleLinear<string>().domain([min, max]).range(['#dbeafe', '#1e3a8a']),
    };
  }, [datosMapa]);

  const esPorcentaje = (nombre: string) => {
    const n = (nombre || '').toLowerCase();
    return n.includes('tasa') || n.includes('porcentaje') || n.includes('%');
  };

  const abrirFicha = async (nombreDepto: string) => {
    setLoadingFicha(true);
    try {
      const res = await fetch(
        `/api/departamento/ficha?dataset=${datasetSel}&region=${encodeURIComponent(nombreDepto)}&anio=${anioMapa}`
      );
      if (!res.ok) throw new Error('Error backend');
      const data: FichaData = await res.json();
      setFichaModal(data);
    } catch {
      setFichaModal({
        region: nombreDepto,
        anio: anioMapa,
        dataset: datasetSel,
        indicadores: [
          {
            indicador: indMapa,
            valor:
              datosMapa[
                nombreDepto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
              ] ?? null,
            unidad: 'valor',
          },
        ],
      });
    } finally {
      setLoadingFicha(false);
    }
  };

  const exportarCSV = () => {
    if (datosGrafico.length === 0) return;
    const encabezados = ['Año', ...lineasActivas].join(',');
    const filas = datosGrafico.map((d: any) => [d.anio, ...lineasActivas.map((k) => d[k] ?? '')].join(','));
    const blob = new Blob([[encabezados, ...filas].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `observatorio_${datasetSel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarImagenPNG = async () => {
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, { backgroundColor: '#ffffff', quality: 0.95 });
      const a = document.createElement('a');
      a.download = `observatorio_${datasetSel}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error(e);
    }
  };

  // Tooltip sobrio con transición
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #0f172a',
          borderRadius: '2px',
          padding: '0.65rem 0.85rem',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.08)',
          minWidth: '190px',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '0.35rem',
            marginBottom: '0.45rem',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.04em' }}>
            Año
          </span>
          <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
            {label}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {payload.map((entry: any, index: number) => {
            const sufijo = esPorcentaje(entry.name) ? ' %' : '';
            const val =
              entry.value !== null && entry.value !== undefined
                ? `${Number(entry.value).toLocaleString('es-CO')}${sufijo}`
                : '—';

            return (
              <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', maxWidth: '140px' }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: entry.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: '#334155',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.name}
                  </span>
                </div>
                <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.65rem',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: '0.84rem',
    outline: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.72rem',
    fontWeight: '700',
    color: '#475569',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <div
      style={{
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
        color: '#0f172a',
        padding: '2rem 1.25rem',
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
        
        {/* ENCABEZADO INSTITUCIONAL - "BASE DE DATOS TERRITORIAL" A LA IZQUIERDA */}
        <header
          style={{
            borderBottom: '2px solid #0f172a',
            paddingBottom: '1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '0.25rem',
                textAlign: 'left',
              }}
            >
              BASE DE DATOS TERRITORIAL
            </div>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: '800',
                margin: 0,
                color: '#0f172a',
                letterSpacing: '-0.02em',
                textAlign: 'left',
              }}
            >
              Observatorio Económico y Territorial
            </h1>
          </div>

          {/* Navegación de pestañas con transición */}
          <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid #e2e8f0' }}>
            <button
              onClick={() => setVistaActiva('grafica')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '0.84rem',
                color: vistaActiva === 'grafica' ? '#0f172a' : '#64748b',
                borderBottom: vistaActiva === 'grafica' ? '2px solid #0f172a' : '2px solid transparent',
                marginBottom: '-1px',
                transition: 'all 0.2s ease',
              }}
            >
              Series de Tiempo
            </button>
            <button
              onClick={() => setVistaActiva('mapa')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '0.84rem',
                color: vistaActiva === 'mapa' ? '#0f172a' : '#64748b',
                borderBottom: vistaActiva === 'mapa' ? '2px solid #0f172a' : '2px solid transparent',
                marginBottom: '-1px',
                transition: 'all 0.2s ease',
              }}
            >
              Distribución Geográfica
            </button>
          </div>
        </header>

        {/* BARRA DE FILTROS PRINCIPALES */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', width: '100%', maxWidth: '440px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              Conjunto de Datos:
            </span>
            <select
              value={datasetSel}
              onChange={(e) => setDatasetSel(e.target.value)}
              style={selectStyle}
            >
              {datasets.map((d) => (
                <option key={d} value={d}>
                  {d.replace(/_/g, ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={exportarImagenPNG}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Camera size={13} /> PNG
            </button>
            <button
              onClick={exportarCSV}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Download size={13} /> CSV
            </button>
          </div>
        </div>

        {/* VISTA 1: SERIES TEMPORALES */}
        {vistaActiva === 'grafica' && (
          <div className="animate-fade-in">
            {/* Control de modo y selectores */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
                <button
                  onClick={() => setModo('modoA')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '4px',
                    border: '1px solid ' + (modo === 'modoA' ? '#0f172a' : '#cbd5e1'),
                    background: modo === 'modoA' ? '#0f172a' : '#ffffff',
                    color: modo === 'modoA' ? '#ffffff' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Comparar Regiones
                </button>
                <button
                  onClick={() => setModo('modoB')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '4px',
                    border: '1px solid ' + (modo === 'modoB' ? '#0f172a' : '#cbd5e1'),
                    background: modo === 'modoB' ? '#0f172a' : '#ffffff',
                    color: modo === 'modoB' ? '#ffffff' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Relación Dual (2 Variables)
                </button>
              </div>

              {modo === 'modoA' ? (
                <div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>Indicador de Análisis:</label>
                    <select
                      value={indFijo}
                      onChange={(e) => setIndFijo(e.target.value)}
                      style={{ ...selectStyle, maxWidth: '440px' }}
                    >
                      {indicadores.map((i) => (
                        <option key={i.indicador} value={i.indicador}>
                          {i.indicador} {i.unidad ? `(${i.unidad})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label style={labelStyle}>Departamentos o Territorios:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    <select value={regA1} onChange={(e) => setRegA1(e.target.value)} style={selectStyle}>
                      {regiones.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select value={regA2} onChange={(e) => setRegA2(e.target.value)} style={selectStyle}>
                      <option value="">— Sin segundo departamento —</option>
                      {regiones.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select value={regA3} onChange={(e) => setRegA3(e.target.value)} style={selectStyle}>
                      <option value="">— Sin tercer departamento —</option>
                      {regiones.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>Territorio Analizado:</label>
                    <select value={regFija} onChange={(e) => setRegFija(e.target.value)} style={{ ...selectStyle, maxWidth: '440px' }}>
                      {regiones.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>Variable 1 (Eje Izquierdo):</label>
                      <select value={indB1} onChange={(e) => setIndB1(e.target.value)} style={selectStyle}>
                        {indicadores.map((i) => <option key={i.indicador} value={i.indicador}>{i.indicador}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Variable 2 (Eje Derecho):</label>
                      <select value={indB2} onChange={(e) => setIndB2(e.target.value)} style={selectStyle}>
                        <option value="">— Ninguna —</option>
                        {indicadores.map((i) => <option key={i.indicador} value={i.indicador}>{i.indicador}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Rango de Años y Promedio */}
              <div
                style={{
                  marginTop: '1.1rem',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#64748b' }}>PERÍODO:</span>
                  <select
                    value={rangoAnios.min}
                    onChange={(e) => setRangoAnios((p) => ({ ...p, min: Number(e.target.value) }))}
                    style={{ ...selectStyle, width: 'auto', padding: '0.35rem 0.55rem' }}
                  >
                    {Array.from({ length: limitesDataset.max - limitesDataset.min + 1 }, (_, i) => limitesDataset.min + i).map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <span style={{ color: '#94a3b8' }}>—</span>
                  <select
                    value={rangoAnios.max}
                    onChange={(e) => setRangoAnios((p) => ({ ...p, max: Number(e.target.value) }))}
                    style={{ ...selectStyle, width: 'auto', padding: '0.35rem 0.55rem' }}
                  >
                    {Array.from({ length: limitesDataset.max - limitesDataset.min + 1 }, (_, i) => limitesDataset.min + i).map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>

                {modo === 'modoA' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={mostrarPromedio}
                      onChange={(e) => setMostrarPromedio(e.target.checked)}
                      style={{ accentColor: '#0f172a', cursor: 'pointer' }}
                    />
                    Referencia Nacional
                  </label>
                )}
              </div>
            </div>

            {/* Ficha de Estadísticas (KPIs) */}
            {kpis && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '1rem',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                    Último Dato ({kpis.ultimoAnio})
                  </span>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginTop: '0.2rem', fontVariantNumeric: 'tabular-nums' }}>
                    {kpis.ultimoValor.toLocaleString('es-CO')}
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '1rem',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                    Máximo Histórico
                  </span>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginTop: '0.2rem', fontVariantNumeric: 'tabular-nums' }}>
                    {kpis.maximo.toLocaleString('es-CO')}
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '1rem',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                    Variación Acumulada
                  </span>
                  <div
                    style={{
                      fontSize: '1.4rem',
                      fontWeight: '800',
                      color: Number(kpis.cambioPct) >= 0 ? '#047857' : '#b91c1c',
                      marginTop: '0.2rem',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {Number(kpis.cambioPct) > 0 ? `+${kpis.cambioPct}%` : `${kpis.cambioPct}%`}
                  </div>
                </div>
              </div>
            )}

            {/* CONTENEDOR DE LA GRÁFICA CON ANIMACIÓN RECHARTS ACTIVA */}
            <div
              ref={chartRef}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                minHeight: '430px',
              }}
            >
              <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.05rem', color: '#0f172a', fontWeight: '700' }}>
                {modo === 'modoA' ? indFijo : `${indB1} y ${indB2 || ''} en ${regFija}`}
              </h3>

              {loading ? (
                <div style={{ height: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                  Cargando serie estadística...
                </div>
              ) : datosGrafico.length === 0 ? (
                <div style={{ height: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                  No se registran datos para la selección actual.
                </div>
              ) : (
                <div style={{ width: '100%', height: 380 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={datosGrafico} margin={{ top: 10, right: 15, left: -5, bottom: 20 }}>
                      <CartesianGrid stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="anio" stroke="#64748b" tickLine={false} fontSize={12} dy={6} />
                      <YAxis
                        yAxisId="left"
                        stroke="#64748b"
                        domain={['auto', 'auto']}
                        tickLine={false}
                        fontSize={12}
                        tickFormatter={(v) => Number(v).toLocaleString('es-CO')}
                      />
                      {modo === 'modoB' && indB2 && (
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke={COLOR_2}
                          domain={['auto', 'auto']}
                          tickLine={false}
                          fontSize={12}
                          tickFormatter={(v) => Number(v).toLocaleString('es-CO')}
                        />
                      )}

                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.82rem' }} />

                      {modo === 'modoA' &&
                        lineasActivas.map((linea, idx) => (
                          <Line
                            key={linea}
                            yAxisId="left"
                            type="monotone"
                            dataKey={linea}
                            stroke={[COLOR_1, COLOR_2, COLOR_3][idx % 3]}
                            strokeWidth={2}
                            dot={{ r: 2.5 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                            isAnimationActive={true}
                            animationDuration={850}
                            animationEasing="ease-in-out"
                          />
                        ))}

                      {modo === 'modoA' && mostrarPromedio && (
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="Promedio Nacional"
                          stroke={COLOR_PROMEDIO}
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                          connectNulls
                          isAnimationActive={true}
                          animationDuration={850}
                        />
                      )}

                      {modo === 'modoB' && lineasActivas[0] && (
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey={lineasActivas[0]}
                          stroke={COLOR_1}
                          strokeWidth={2}
                          dot={{ r: 2.5 }}
                          connectNulls
                          isAnimationActive={true}
                          animationDuration={850}
                          animationEasing="ease-in-out"
                        />
                      )}

                      {modo === 'modoB' && lineasActivas[1] && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey={lineasActivas[1]}
                          stroke={COLOR_2}
                          strokeWidth={2}
                          dot={{ r: 2.5 }}
                          connectNulls
                          isAnimationActive={true}
                          animationDuration={850}
                          animationEasing="ease-in-out"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISTA 2: MAPA GEOGRÁFICO */}
        {vistaActiva === 'mapa' && (
          <div
            className="animate-fade-in"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              padding: '1.5rem',
              position: 'relative',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div>
                <label style={labelStyle}>Indicador Geográfico:</label>
                <select
                  value={indMapa}
                  onChange={(e) => setIndMapa(e.target.value)}
                  style={selectStyle}
                >
                  {indicadores.map((i) => (
                    <option key={i.indicador} value={i.indicador}>
                      {i.indicador}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Año del Mapa ({anioMapa}):</label>
                <input
                  type="range"
                  min="2007"
                  max="2025"
                  step="1"
                  value={anioMapa}
                  onChange={(e) => setAnioMapa(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#0f172a', cursor: 'pointer', marginTop: '0.4rem' }}
                />
              </div>
            </div>

            {loadingMapa || !mapGeoData ? (
              <div style={{ height: '540px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Cargando mapa...
              </div>
            ) : (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '560px',
                  overflow: 'hidden',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                {/* Controles de Zoom */}
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10 }}>
                  <button
                    onClick={() => setZoomPosition((p) => ({ ...p, zoom: Math.min(p.zoom * 1.35, 4) }))}
                    style={{
                      width: '32px',
                      height: '32px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => setZoomPosition((p) => ({ ...p, zoom: Math.max(p.zoom / 1.35, 0.8) }))}
                    style={{
                      width: '32px',
                      height: '32px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    onClick={() => setZoomPosition({ coordinates: [-73.5, 4.2], zoom: 1 })}
                    style={{
                      width: '32px',
                      height: '32px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>

                <ComposableMap
                  projection="geoMercator"
                  projectionConfig={{ scale: 2300, center: [-73.5, 4.2] }}
                  style={{ width: '100%', height: '100%', cursor: 'grab' }}
                >
                  <ZoomableGroup
                    zoom={zoomPosition.zoom || 1}
                    center={zoomPosition.coordinates || [-73.5, 4.2]}
                    onMoveEnd={({ coordinates, zoom }) => setZoomPosition({ coordinates, zoom })}
                  >
                    <Geographies geography={mapGeoData}>
                      {({ geographies }) =>
                        geographies.map((geo) => {
                          const props = geo.properties || {};
                          const deptoName = props.NOMBRE_DPT || props.DPTO || props.name || props.NAME_1 || props.departamento || '';
                          const cleanName = deptoName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                          const valor = datosMapa[cleanName] !== undefined ? datosMapa[cleanName] : null;
                          const colorFill = valor !== null ? escalaColor(valor) : '#e2e8f0';

                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              fill={colorFill}
                              stroke="#ffffff"
                              strokeWidth={0.7 / zoomPosition.zoom}
                              onMouseMove={(e) => {
                                if (tooltipInfo?.fijado) return;
                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                                setTooltipInfo({
                                  nombre: deptoName,
                                  valor,
                                  x: Math.min(e.clientX - (rect?.left || 0) + 15, 680),
                                  y: Math.max(e.clientY - (rect?.top || 0) - 20, 20),
                                  fijado: false,
                                });
                              }}
                              onMouseLeave={() => {
                                if (!tooltipInfo?.fijado) setTooltipInfo(null);
                              }}
                              onClick={(e) => {
                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                                setTooltipInfo({
                                  nombre: deptoName,
                                  valor,
                                  x: Math.min(e.clientX - (rect?.left || 0) + 15, 680),
                                  y: Math.max(e.clientY - (rect?.top || 0) - 20, 20),
                                  fijado: true,
                                });
                              }}
                              style={{
                                default: { outline: 'none', transition: 'fill 0.2s ease' },
                                hover: { fill: '#d97706', outline: 'none', cursor: 'pointer' },
                              }}
                            />
                          );
                        })
                      }
                    </Geographies>
                  </ZoomableGroup>
                </ComposableMap>

                {/* Tooltip del Mapa */}
                {tooltipInfo && (
                  <div
                    style={{
                      position: 'absolute',
                      top: Math.min(tooltipInfo.y, 360),
                      left: Math.min(tooltipInfo.x, 680),
                      background: '#ffffff',
                      color: '#0f172a',
                      padding: '0.75rem 0.95rem',
                      borderRadius: '2px',
                      zIndex: 30,
                      minWidth: '220px',
                      border: '1px solid #0f172a',
                      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
                      animation: 'fadeIn 0.2s ease-out',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{tooltipInfo.nombre}</strong>
                      {tooltipInfo.fijado && (
                        <button
                          onClick={() => setTooltipInfo(null)}
                          style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.74rem', marginBottom: '0.4rem' }}>
                      {indMapa} ({anioMapa})
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.6rem', fontVariantNumeric: 'tabular-nums' }}>
                      {tooltipInfo.valor !== null
                        ? `${Number(tooltipInfo.valor).toLocaleString('es-CO')}${esPorcentaje(indMapa) ? ' %' : ''}`
                        : 'Sin registro'}
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => abrirFicha(tooltipInfo.nombre)}
                        style={{
                          flex: 1,
                          padding: '0.35rem',
                          background: '#ffffff',
                          color: '#0f172a',
                          border: '1px solid #cbd5e1',
                          borderRadius: '2px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        Ficha
                      </button>
                      <button
                        onClick={() => {
                          setRegA1(tooltipInfo.nombre);
                          setRegFija(tooltipInfo.nombre);
                          setVistaActiva('grafica');
                          setTooltipInfo(null);
                        }}
                        style={{
                          flex: 1,
                          padding: '0.35rem',
                          background: '#0f172a',
                          color: '#ffffff',
                          border: '1px solid #0f172a',
                          borderRadius: '2px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        Ver Serie
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODAL DE FICHA DEPARTAMENTAL */}
        {fichaModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: '1rem',
            }}
          >
            <div
              className="animate-fade-in"
              style={{
                background: '#ffffff',
                border: '1px solid #0f172a',
                borderRadius: '4px',
                width: '100%',
                maxWidth: '640px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '1.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1.25rem',
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: '0.85rem',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                    Registro Territorial
                  </span>
                  <h2 style={{ margin: '0.2rem 0 0 0', fontSize: '1.35rem', fontWeight: '800', color: '#0f172a' }}>
                    {fichaModal.region}
                  </h2>
                  <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                    Año observado: {fichaModal.anio}
                  </p>
                </div>
                <button
                  onClick={() => setFichaModal(null)}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {loadingFicha ? (
                <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Consultando registro...</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {fichaModal.indicadores.map((ind, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#f8fafc',
                        padding: '0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '2px',
                      }}
                    >
                      <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>
                        {ind.indicador}
                      </span>
                      <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                        {ind.valor !== null ? Number(ind.valor).toLocaleString('es-CO') : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}