import Script from "next/script";

export default function HomePage() {
  const appName = "ConvertOFX";

  return (
    <>
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-squares">
          {Array.from({ length: 10 }).map((_, index) => (
            <span className="ambient-square" key={index} />
          ))}
        </div>
      </div>

      <header className="topbar" role="banner">
        <div className="topbar-inner">
          <img className="brand-logo" src="/static/logoora.png" alt="ORA Empresas" />
          <div className="topbar-meta">
            <strong>{appName}</strong>
            <p>Ambiente corporativo ORA Empresas</p>
          </div>
        </div>
      </header>

      <main className="page-shell" role="main">
        <article className="hero-card">
          <header className="card-header">
            <span className="eyebrow" aria-label="Secao de upload e conversao">
              Upload e conversao
            </span>
            <h1>ConvertOFX</h1>
            <p className="subtitle">Conversor OFX para XLSX e PDF.</p>
          </header>

          <div className="card-body">
            <form id="convertForm" className="upload-form" encType="multipart/form-data" noValidate>
              <label className="upload-field" htmlFor="file" id="uploadZone">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                  <path d="M12 12v9" />
                  <path d="m16 16-4-4-4 4" />
                </svg>

                <span className="upload-label-text">Clique para selecionar ou arraste aqui</span>
                <span className="upload-label-hint">
                  Apenas arquivos <strong>.OFX</strong>
                </span>
                <span className="upload-filename" id="uploadFilename" aria-live="polite" />

                <input id="file" type="file" name="file" accept=".ofx" required aria-label="Selecionar arquivo OFX" />
              </label>

              <div className="form-actions">
                <button id="submitButton" className="primary-btn" type="submit">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span className="btn-text">Converter e Enviar</span>
                  <span className="btn-spinner" aria-hidden="true" />
                </button>
              </div>
            </form>

            <div id="progressWrapper" className="progress-wrapper hidden" role="status" aria-live="polite">
              <div className="progress-info">
                <span id="progressStep" className="progress-step-label">Preparando...</span>
                <span id="progressPercent" className="progress-pct">0%</span>
                <span id="progressSuccess" className="progress-success hidden" aria-hidden="true">
                  <span className="success-check">✓</span>
                  <span>Concluido</span>
                </span>
              </div>
              <div className="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div id="progressFill" className="progress-fill" style={{ width: "0%" }} />
              </div>
            </div>

            <div id="messageBox" className="message-box hidden" role="alert" aria-live="assertive" />

            <div id="downloadArea" className="download-area hidden">
              <h2>Arquivos gerados</h2>
              <div className="download-actions">
                <a id="downloadPdf" className="download-btn download-btn-pdf hidden" href="#" target="_blank" rel="noopener noreferrer">
                  Baixar PDF
                </a>
                <a id="downloadExcel" className="download-btn download-btn-excel hidden" href="#" target="_blank" rel="noopener noreferrer">
                  Baixar Excel
                </a>
              </div>
            </div>
          </div>

          <footer className="card-footer">
            <span>Projeto Desenvolvido por Jainel P Santana - SISTEMAS - TI</span>
          </footer>
        </article>
      </main>

      <Script src="/static/app.js" strategy="afterInteractive" />
    </>
  );
}
