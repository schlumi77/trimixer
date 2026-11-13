import type { Step } from '../logic/calculations';

const MixingChart = ({ initialMix, steps }: { initialMix: { o2: number, he: number }, steps: Step[] }) => {
  const chartWidth = 400;
  const chartHeight = 100;
  const padding = 10;
  
  const data = [
    initialMix,
    ...steps.map(s => s.mixAfter)
  ];

  const pointsHe = data.map((d, i) => `${(i / (data.length - 1)) * (chartWidth - 2 * padding) + padding},${chartHeight - padding - d.he * (chartHeight - 2 * padding)}`).join(' ');
  const pointsO2 = data.map((d, i) => `${(i / (data.length - 1)) * (chartWidth - 2 * padding) + padding},${chartHeight - padding - d.o2 * (chartHeight - 2 * padding)}`).join(' ');

  return (
    <div className="mixing-chart-container">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mixing-chart">
        {/* Grids */}
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#333" />
        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#333" />
        
        {/* Helium Path */}
        <polyline fill="none" stroke="#ff9800" strokeWidth="2" points={pointsHe} />
        {/* Oxygen Path */}
        <polyline fill="none" stroke="#00bcd4" strokeWidth="2" points={pointsO2} />
        
        {/* Dots */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={(i / (data.length - 1)) * (chartWidth - 2 * padding) + padding} cy={chartHeight - padding - d.he * (chartHeight - 2 * padding)} r="3" fill="#ff9800" />
            <circle cx={(i / (data.length - 1)) * (chartWidth - 2 * padding) + padding} cy={chartHeight - padding - d.o2 * (chartHeight - 2 * padding)} r="3" fill="#00bcd4" />
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span style={{ color: '#00bcd4' }}>● Oxygen (%)</span>
        <span style={{ color: '#ff9800' }}>● Helium (%)</span>
      </div>
    </div>
  );
};

export default MixingChart;
