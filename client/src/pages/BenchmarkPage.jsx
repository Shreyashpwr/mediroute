import React, { useState, useEffect } from 'react';
import api from '../services/api.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export const BenchmarkPage = () => {
  const [benchmark, setBenchmark] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  // Form controls
  const [seed, setSeed] = useState(42);
  const [scenarioId, setScenarioId] = useState('standard_day');
  const [incidentCount, setIncidentCount] = useState(15);
  const [durationMinutes, setDurationMinutes] = useState(120);

  // Filter for event log viewer
  const [eventFilter, setEventFilter] = useState('all');

  const fetchLatestBenchmark = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getLatestBenchmark();
      if (res?.data) {
        setBenchmark(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch benchmark results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestBenchmark();
  }, []);

  const handleRunBenchmark = async (e) => {
    e.preventDefault();
    try {
      setRunning(true);
      setError(null);
      const res = await api.runSimulationBenchmark({
        seed: isNaN(Number(seed)) ? String(seed) : Number(seed),
        scenarioId,
        incidentCount: Number(incidentCount) || 15,
        durationMinutes: Number(durationMinutes) || 120,
      });
      if (res?.data) {
        setBenchmark(res.data);
      }
    } catch (err) {
      setError(err.message || 'Simulation execution failed');
    } finally {
      setRunning(false);
    }
  };

  const downloadJson = () => {
    if (!benchmark) return;
    const blob = new Blob([JSON.stringify(benchmark, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediroute_benchmark_seed_${benchmark.seed || seed}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runs = benchmark?.algorithmRuns || {};
  const proposed = runs.proposed?.metrics || {};
  const nearest = runs.nearest_available?.metrics || {};
  const dijkstra = runs.shortest_path_dijkstra?.metrics || {};

  const propPerf = proposed.performanceMetrics || {};
  const nearPerf = nearest.performanceMetrics || {};
  const dijkPerf = dijkstra.performanceMetrics || {};

  const propServ = proposed.serviceLevelMetrics || {};
  const nearServ = nearest.serviceLevelMetrics || {};
  const dijkServ = dijkstra.serviceLevelMetrics || {};

  const propComp = proposed.computationalMetrics || {};
  const nearComp = nearest.computationalMetrics || {};
  const dijkComp = dijkstra.computationalMetrics || {};

  // Find max response time to scale chart bars nicely
  const maxMeanTime = Math.max(
    propPerf.meanResponseTimeMinutes || 0,
    nearPerf.meanResponseTimeMinutes || 0,
    dijkPerf.meanResponseTimeMinutes || 0,
    1
  );

  const maxP95Time = Math.max(
    propPerf.p95ResponseTimeMinutes || 0,
    nearPerf.p95ResponseTimeMinutes || 0,
    dijkPerf.p95ResponseTimeMinutes || 0,
    1
  );

  // Extract events for log table
  const allEvents = runs.proposed?.eventLog || [];
  const filteredEvents =
    eventFilter === 'all'
      ? allEvents
      : allEvents.filter((e) => e.eventType === eventFilter);

  return (
    <div className="page-container benchmark-page" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#0284c722', border: '1px solid #0284c766', padding: '4px 10px', borderRadius: '16px', fontSize: '0.8rem', color: '#38bdf8', marginBottom: '8px' }}>
              <span>🧪</span>
              <strong>DISCRETE-EVENT SIMULATION LAB</strong>
              <span>•</span>
              <span>SYNTHETIC BENCHMARK DATA</span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: '700', color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
              Algorithmic Simulation & Benchmark Suite
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginTop: '6px' }}>
              Reproducible discrete-event simulation comparing MediRoute's multi-criteria allocation against standard CAD nearest-neighbor and Dijkstra shortest-path baselines.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={downloadJson}
              disabled={!benchmark}
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: benchmark ? 'pointer' : 'not-allowed',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📥 Download JSON Report
            </button>
            <button
              onClick={fetchLatestBenchmark}
              disabled={loading || running}
              style={{
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              🔄 Refresh Latest
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* Control Panel Card */}
      <div style={{ background: '#111a2e', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#f8fafc', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚙️</span> Benchmark Configuration & Scenario Runner
        </h2>

        <form onSubmit={handleRunBenchmark} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>
              Scenario Profile
            </label>
            <select
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              disabled={running}
              style={{
                width: '100%',
                background: '#0b1120',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.9rem',
              }}
            >
              <option value="standard_day">Standard Metropolitan Day Shift (10 inc/h)</option>
              <option value="mass_casualty">Mass Casualty Highway Collision (28 inc/h)</option>
              <option value="arterial_gridlock">Monsoon Flooding & Arterial Gridlock (14 inc/h)</option>
              <option value="hospital_surge">Hospital Bed Saturation Surge (16 inc/h)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>
              Reproducibility Seed
            </label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. 42 or custom-key"
              disabled={running}
              style={{
                width: '100%',
                background: '#0b1120',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>
              Incident Count Cap
            </label>
            <input
              type="number"
              min="3"
              max="100"
              value={incidentCount}
              onChange={(e) => setIncidentCount(e.target.value)}
              disabled={running}
              style={{
                width: '100%',
                background: '#0b1120',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>
              Simulated Timeline (Minutes)
            </label>
            <input
              type="number"
              min="30"
              max="240"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              disabled={running}
              style={{
                width: '100%',
                background: '#0b1120',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={running}
              style={{
                width: '100%',
                background: running ? '#0369a1' : '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '10px 16px',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '0.95rem',
                cursor: running ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {running ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  Simulating Timeline...
                </>
              ) : (
                '▶ Run Comparative Benchmark'
              )}
            </button>
          </div>
        </form>

        <div style={{ marginTop: '12px', display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '0.8rem', color: '#64748b' }}>
          <span>Current Active Run: <strong>{benchmark?.scenarioName || 'None'}</strong></span>
          <span>Seed: <code>{benchmark?.seed ?? 'N/A'}</code></span>
          <span>Incidents Evaluated: <strong>{benchmark?.totalIncidents ?? 0}</strong></span>
          <span>Simulated Timeline: <strong>{benchmark?.durationMinutes ?? 120} min</strong></span>
          <span>Timestamp: <code>{benchmark?.timestamp ? new Date(benchmark.timestamp).toLocaleTimeString() : 'N/A'}</code></span>
        </div>
      </div>

      {loading && !benchmark ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <LoadingSpinner />
          <p style={{ marginTop: '16px', color: '#94a3b8' }}>Loading latest benchmark results from server...</p>
        </div>
      ) : !benchmark ? (
        <div style={{ padding: '40px', background: '#111a2e', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ color: '#94a3b8' }}>No benchmark run found. Click "Run Comparative Benchmark" above to generate your first benchmark dataset.</p>
        </div>
      ) : (
        <>
          {/* Key Metric KPI Comparison Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {/* Card 1: Mean Response Time */}
            <div style={{ background: '#111a2e', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Mean Response Time (Lower is better)
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f8fafc', margin: '8px 0' }}>
                {propPerf.meanResponseTimeMinutes ?? 0} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>min</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8' }}>
                  <span>Proposed Multi-Criteria:</span>
                  <strong>{propPerf.meanResponseTimeMinutes ?? 0} min</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Nearest Available:</span>
                  <strong>{nearPerf.meanResponseTimeMinutes ?? 0} min</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Shortest Dijkstra:</span>
                  <strong>{dijkPerf.meanResponseTimeMinutes ?? 0} min</strong>
                </div>
              </div>
            </div>

            {/* Card 2: 95th Percentile Response Time */}
            <div style={{ background: '#111a2e', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                P95 Response Time (Tail Risk)
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f8fafc', margin: '8px 0' }}>
                {propPerf.p95ResponseTimeMinutes ?? 0} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>min</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8' }}>
                  <span>Proposed Multi-Criteria:</span>
                  <strong>{propPerf.p95ResponseTimeMinutes ?? 0} min</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Nearest Available:</span>
                  <strong>{nearPerf.p95ResponseTimeMinutes ?? 0} min</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Shortest Dijkstra:</span>
                  <strong>{dijkPerf.p95ResponseTimeMinutes ?? 0} min</strong>
                </div>
              </div>
            </div>

            {/* Card 3: Unserved Incident Rate */}
            <div style={{ background: '#111a2e', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Unserved Incident Rate (Lower is better)
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: propServ.unservedIncidentRate > 0 ? '#f59e0b' : '#10b981', margin: '8px 0' }}>
                {((propServ.unservedIncidentRate ?? 0) * 100).toFixed(1)}%
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8' }}>
                  <span>Proposed Multi-Criteria:</span>
                  <strong>{((propServ.unservedIncidentRate ?? 0) * 100).toFixed(1)}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Nearest Available:</span>
                  <strong>{((nearServ.unservedIncidentRate ?? 0) * 100).toFixed(1)}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Shortest Dijkstra:</span>
                  <strong>{((dijkServ.unservedIncidentRate ?? 0) * 100).toFixed(1)}%</strong>
                </div>
              </div>
            </div>

            {/* Card 4: Algorithm Compute Latency */}
            <div style={{ background: '#111a2e', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Avg Decision Latency (Wall-clock)
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f8fafc', margin: '8px 0' }}>
                {propComp.averageAlgorithmComputeTimeMs ?? 0} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>ms</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8' }}>
                  <span>Proposed Multi-Criteria:</span>
                  <strong>{propComp.averageAlgorithmComputeTimeMs ?? 0} ms</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Nearest Available:</span>
                  <strong>{nearComp.averageAlgorithmComputeTimeMs ?? 0} ms</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Shortest Dijkstra:</span>
                  <strong>{dijkComp.averageAlgorithmComputeTimeMs ?? 0} ms</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Visual SVG Comparative Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Chart 1: Mean & Median Response Time Bar Comparison */}
            <div style={{ background: '#111a2e', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📊</span> Response Time Comparison (Minutes)
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Proposed */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#38bdf8', fontWeight: '600' }}>Proposed (Multi-Criteria + A*)</span>
                    <span style={{ color: '#f8fafc' }}>{propPerf.meanResponseTimeMinutes ?? 0}m mean | {propPerf.medianResponseTimeMinutes ?? 0}m median</span>
                  </div>
                  <div style={{ width: '100%', height: '20px', background: '#0b1120', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                    <div
                      style={{
                        width: `${Math.min(100, ((propPerf.meanResponseTimeMinutes || 0) / maxMeanTime) * 100)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
                        borderRadius: '6px',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Nearest Available */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#94a3b8', fontWeight: '500' }}>Nearest Available Baseline</span>
                    <span style={{ color: '#f8fafc' }}>{nearPerf.meanResponseTimeMinutes ?? 0}m mean | {nearPerf.medianResponseTimeMinutes ?? 0}m median</span>
                  </div>
                  <div style={{ width: '100%', height: '20px', background: '#0b1120', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, ((nearPerf.meanResponseTimeMinutes || 0) / maxMeanTime) * 100)}%`,
                        height: '100%',
                        background: '#64748b',
                        borderRadius: '6px',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Dijkstra */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#94a3b8', fontWeight: '500' }}>Shortest-Path Dijkstra Baseline</span>
                    <span style={{ color: '#f8fafc' }}>{dijkPerf.meanResponseTimeMinutes ?? 0}m mean | {dijkPerf.medianResponseTimeMinutes ?? 0}m median</span>
                  </div>
                  <div style={{ width: '100%', height: '20px', background: '#0b1120', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, ((dijkPerf.meanResponseTimeMinutes || 0) / maxMeanTime) * 100)}%`,
                        height: '100%',
                        background: '#475569',
                        borderRadius: '6px',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '14px', fontSize: '0.78rem', color: '#64748b', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                Note: Nearest-Available greedily minimizes initial leg distance, whereas Proposed algorithm balances clinical capability match, fuel reserve, and hospital diversion buffers to avoid re-transfers.
              </div>
            </div>

            {/* Chart 2: 95th Percentile Tail Risk Comparison */}
            <div style={{ background: '#111a2e', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏱️</span> 95th Percentile Response Time (P95 Tail Risk)
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Proposed */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#38bdf8', fontWeight: '600' }}>Proposed (Multi-Criteria + A*)</span>
                    <span style={{ color: '#f8fafc' }}>{propPerf.p95ResponseTimeMinutes ?? 0}m P95</span>
                  </div>
                  <div style={{ width: '100%', height: '20px', background: '#0b1120', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, ((propPerf.p95ResponseTimeMinutes || 0) / maxP95Time) * 100)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
                        borderRadius: '6px',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Nearest Available */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#94a3b8', fontWeight: '500' }}>Nearest Available Baseline</span>
                    <span style={{ color: '#f8fafc' }}>{nearPerf.p95ResponseTimeMinutes ?? 0}m P95</span>
                  </div>
                  <div style={{ width: '100%', height: '20px', background: '#0b1120', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, ((nearPerf.p95ResponseTimeMinutes || 0) / maxP95Time) * 100)}%`,
                        height: '100%',
                        background: '#64748b',
                        borderRadius: '6px',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Dijkstra */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#94a3b8', fontWeight: '500' }}>Shortest-Path Dijkstra Baseline</span>
                    <span style={{ color: '#f8fafc' }}>{dijkPerf.p95ResponseTimeMinutes ?? 0}m P95</span>
                  </div>
                  <div style={{ width: '100%', height: '20px', background: '#0b1120', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, ((dijkPerf.p95ResponseTimeMinutes || 0) / maxP95Time) * 100)}%`,
                        height: '100%',
                        background: '#475569',
                        borderRadius: '6px',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '14px', fontSize: '0.78rem', color: '#64748b', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                P95 reflects worst-case response delays under traffic peaks, hospital diversion, or localized road closures.
              </div>
            </div>
          </div>

          {/* Event Trace Log Viewer */}
          <div style={{ background: '#111a2e', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📜</span> Simulation Event Log Trace ({filteredEvents.length} events)
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Filter Event:</label>
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  style={{
                    background: '#0b1120',
                    border: '1px solid #1e293b',
                    color: '#f8fafc',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                  }}
                >
                  <option value="all">All Events</option>
                  <option value="DISPATCH_DECISION">DISPATCH_DECISION</option>
                  <option value="AMBULANCE_ARRIVED_SCENE">AMBULANCE_ARRIVED_SCENE</option>
                  <option value="PATIENT_ADMITTED">PATIENT_ADMITTED</option>
                  <option value="ROAD_CLOSURE_START">ROAD_CLOSURE_START</option>
                  <option value="INCIDENT_UNSERVED">INCIDENT_UNSERVED</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '350px', overflowY: 'auto', border: '1px solid #1e293b', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0b1120', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '8px 12px' }}>Timeline</th>
                    <th style={{ padding: '8px 12px' }}>Event Type</th>
                    <th style={{ padding: '8px 12px' }}>Incident</th>
                    <th style={{ padding: '8px 12px' }}>Resource ID</th>
                    <th style={{ padding: '8px 12px' }}>Metrics / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((evt, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #16223b', color: '#f8fafc' }}>
                      <td style={{ padding: '8px 12px', color: '#38bdf8', fontFamily: 'monospace' }}>
                        T+{evt.time.toFixed(1)}m
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          background: evt.eventType === 'PATIENT_ADMITTED' ? '#10b98122' : evt.eventType === 'DISPATCH_DECISION' ? '#0284c722' : '#334155',
                          color: evt.eventType === 'PATIENT_ADMITTED' ? '#34d399' : evt.eventType === 'DISPATCH_DECISION' ? '#38bdf8' : '#e2e8f0',
                        }}>
                          {evt.eventType}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#94a3b8' }}>
                        {evt.data?.incidentId || '-'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {evt.data?.ambulanceId || evt.data?.facilityId || evt.data?.roadId || '-'}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                        {evt.data?.responseTimeMinutes !== undefined
                          ? `Response: ${evt.data.responseTimeMinutes}m`
                          : evt.data?.totalMissionDurationMinutes !== undefined
                          ? `Total Mission: ${evt.data.totalMissionDurationMinutes}m (Beds left: ${evt.data.facilityAvailableBeds})`
                          : evt.data?.computeTimeMs !== undefined
                          ? `Compute: ${evt.data.computeTimeMs}ms`
                          : evt.data?.label || evt.data?.reason || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BenchmarkPage;
