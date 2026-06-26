"use client";

import React, { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  RefreshCw,
  Info,
  Download,
  FileText,
  Moon,
  Sun
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from "./ui/card";
import { Progress } from "./ui/progress";

// Size formatter helper
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface FileInfo {
  name: string;
  size: string;
  uploadedAt: string;
}

interface ConvertResult {
  banco: string;
  totalTransactions: number;
  emailSent: boolean;
  emailRecipient: string;
  emailMessageId?: string;
  excel: string;
  pdf: string;
}

export function OfxConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [isDark, setIsDark] = useState(false);

  // Animate progress smoothly during api request
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "processing") {
      setProgress(10);
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90; // Hold at 90% until server responds
          }
          const increment = (100 - prev) * 0.15;
          return prev + increment;
        });
      }, 150);
    } else if (status === "success") {
      setProgress(100);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const selectedFile = acceptedFiles[0];

    // Reset previous states
    setErrorMessage(null);
    setResult(null);

    // Extension validation
    if (!selectedFile.name.toLowerCase().endsWith(".ofx")) {
      setStatus("error");
      setErrorMessage("Arquivo inválido. Selecione um arquivo OFX.");
      setFile(null);
      setFileInfo(null);
      return;
    }

    setFile(selectedFile);

    const now = new Date();
    const formattedDate = 
      now.toLocaleDateString("pt-BR") + 
      " às " + 
      now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    setFileInfo({
      name: selectedFile.name,
      size: formatBytes(selectedFile.size),
      uploadedAt: formattedDate
    });

    setStatus("processing");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/convert", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao converter o arquivo.");
      }

      // Add a slight delay for a nice completed transition
      setTimeout(() => {
        setResult({
          banco: data.banco,
          totalTransactions: data.totalTransactions,
          emailSent: data.emailSent,
          emailRecipient: data.emailRecipient,
          emailMessageId: data.emailMessageId,
          excel: data.excel,
          pdf: data.pdf
        });
        setStatus("success");
      }, 800);

    } catch (error: any) {
      setStatus("error");
      setErrorMessage(error.message || "Erro ao converter o arquivo.");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/x-ofx": [".ofx"],
      "text/plain": [".ofx"]
    },
    multiple: false
  });

  /**
   * Triggers client-side browser file download from a Base64 encoded string.
   * Ensures data stays strictly in memory and is cleaned up afterwards.
   */
  const downloadFile = (base64Data: string, fileName: string, mimeType: string) => {
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch {
      setErrorMessage("Erro ao salvar arquivo localmente.");
      setStatus("error");
    }
  };

  const resetConverter = () => {
    setFile(null);
    setFileInfo(null);
    setStatus("idle");
    setProgress(0);
    setErrorMessage(null);
    setResult(null);
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const nextIsDark = !root.classList.contains("dark");

    root.classList.toggle("dark", nextIsDark);
    try {
      localStorage.setItem("ora-theme", nextIsDark ? "dark" : "light");
    } catch {
      // Theme still changes even when storage is unavailable.
    }
    setIsDark(nextIsDark);
  };

  return (
    <>
      <button
        type="button"
        onClick={toggleTheme}
        className="dark-toggle"
        aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
        aria-pressed={isDark}
        title={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <Card className="w-full max-w-xl mx-auto overflow-hidden">
      <CardHeader className="ofx-card-header text-center pt-8 pb-6">
        {/* Company Logo */}
        <div className="mx-auto mb-5 flex h-16 w-full max-w-xs items-center justify-center rounded-lg border border-[var(--border-card)] bg-[var(--ora-navy)] px-5 shadow-lg shadow-black/10">
          <Image
            src="/logo.png"
            alt="Logo da Empresa"
            width={200}
            height={72}
            priority
            className="object-contain h-14 w-auto"
          />
        </div>
        {/* Single H1 on page for SEO compliance */}
        <h1 className="ofx-text-primary text-xl font-bold tracking-tight">
          Conversor OFX
        </h1>
        <CardDescription className="ofx-text-secondary max-w-md mx-auto mt-2 leading-relaxed">
          Faça upload do arquivo OFX enviado pelo banco e receba uma planilha Excel ou PDF.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-8 space-y-6">
        {/* State: IDLE / Drag and Drop Area */}
        {status === "idle" && (
          <div
            {...getRootProps()}
            id="ofx-dropzone-container"
            className={`ofx-dropzone rounded-lg p-8 text-center cursor-pointer flex flex-col items-center justify-center min-h-[220px] group
              ${isDragActive
                ? "active scale-[0.99]"
                : ""
              }`}
          >
            <input {...getInputProps()} id="ofx-file-input" />
            <div className="ofx-icon-wrapper w-12 h-12 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <Upload className="ofx-text-accent w-5 h-5" />
            </div>
            <p className="ofx-text-primary text-sm font-semibold mb-1">
              Arraste e solte seu arquivo OFX aqui
            </p>
            <p className="ofx-text-muted text-xs mb-5">
              Aceita apenas arquivos .ofx
            </p>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              id="ofx-select-button"
              className="pointer-events-none"
            >
              Selecionar Arquivo
            </Button>
          </div>
        )}

        {/* State: PROCESSING / PROGRESS */}
        {status === "processing" && fileInfo && (
          <div className="space-y-6 py-4">
            <div className="ofx-processing-box flex items-center space-x-4 p-4 rounded-lg animate-pulse">
              <div className="ofx-icon-wrapper w-10 h-10 rounded-lg shadow-sm flex items-center justify-center">
                <FileSpreadsheet className="ofx-text-accent w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="ofx-text-primary text-sm font-semibold truncate">{fileInfo.name}</p>
                <p className="ofx-text-muted text-xs mt-0.5">{fileInfo.size} • {fileInfo.uploadedAt}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="ofx-text-secondary font-semibold animate-pulse">Processando arquivo...</span>
                <span className="ofx-text-primary font-bold">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
          </div>
        )}

        {/* State: SUCCESS / DOWNLOAD */}
        {status === "success" && fileInfo && result && (
          <div className="space-y-6 py-2 animate-in fade-in zoom-in-95 duration-200">
            {/* Banner Concluído */}
            <div className="ofx-success-box flex items-center space-x-3 p-4 rounded-lg">
              <CheckCircle2 className="ofx-text-success w-5 h-5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="ofx-text-primary text-sm font-semibold">
                  Conversão concluída e e-mail enviado.
                </p>
                <p className="ofx-text-success text-xs mt-0.5 font-medium">
                  Banco: {result.banco} • {result.totalTransactions} movimentações encontradas.
                </p>
                <p className="ofx-text-secondary text-xs mt-1">
                  Destinatário: {result.emailRecipient}
                </p>
                {result.emailMessageId && (
                  <p className="ofx-text-muted text-xs mt-1 truncate">
                    ID SMTP: {result.emailMessageId}
                  </p>
                )}
              </div>
            </div>

            {/* Arquivo Original Info */}
            <div className="ofx-file-info p-4 rounded-lg space-y-1">
              <p className="ofx-text-muted text-xs font-medium">Arquivo Original</p>
              <p className="ofx-text-primary text-sm font-bold truncate">{fileInfo.name}</p>
              <p className="ofx-text-secondary text-xs">{fileInfo.size} • {fileInfo.uploadedAt}</p>
            </div>

            {/* Downloads Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Button
                onClick={() => downloadFile(result.excel, "Extrato.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
                variant="primary"
                id="ofx-download-excel"
                className="w-full flex items-center justify-center space-x-2 h-12 hover:shadow-lg transition-all duration-200"
              >
                <Download className="h-4 w-4" />
                <span>Baixar Excel (.xlsx)</span>
              </Button>
              <Button
                onClick={() => downloadFile(result.pdf, "Extrato.pdf", "application/pdf")}
                variant="outline"
                id="ofx-download-pdf"
                className="w-full flex items-center justify-center space-x-2 h-12 transition-all duration-200"
              >
                <FileText className="h-4 w-4" />
                <span>Baixar PDF</span>
              </Button>
            </div>
          </div>
        )}

        {/* State: ERROR */}
        {status === "error" && (
          <div className="space-y-6 py-2 animate-in fade-in zoom-in-95 duration-200">
            {/* Error Banner */}
            <div className="ofx-error-box flex items-start space-x-3 p-4 rounded-lg">
              <AlertCircle className="ofx-error-title w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="ofx-error-title text-sm font-semibold">
                  Falha no processamento
                </p>
                <p className="ofx-error-text text-sm mt-1 font-semibold">
                  {errorMessage || "Erro ao converter o arquivo."}
                </p>
              </div>
            </div>

            <div className="ofx-text-muted flex items-center space-x-2 text-xs px-2">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Verifique se o arquivo não está vazio, corrompido ou protegido.</span>
            </div>

            <Button
              onClick={resetConverter}
              variant="outline"
              id="ofx-try-again-button"
              className="w-full flex items-center justify-center space-x-2 h-11"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tentar Novamente</span>
            </Button>
          </div>
        )}
      </CardContent>

      {/* Reset options at bottom */}
      {status === "success" && (
        <CardFooter className="ofx-card-footer p-4 flex justify-between items-center px-8">
          <span className="ofx-text-muted text-xs font-medium">Pronto para nova tarefa</span>
          <button
            onClick={resetConverter}
            id="ofx-convert-another-button"
            className="ofx-text-secondary hover:text-[var(--text-primary)] text-xs font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
          >
            <span>Converter outro arquivo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </CardFooter>
      )}
      </Card>
    </>
  );
}
