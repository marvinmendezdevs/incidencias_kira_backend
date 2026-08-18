"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyAiAnalysis = runDailyAiAnalysis;
exports.startDailyAiAnalysisScheduler = startDailyAiAnalysisScheduler;
const db_1 = require("../db");
const incidence_service_1 = require("./incidence.service");
const ai_incidence_classifier_service_1 = require("./ai-incidence-classifier.service");
const HOUR_EL_SALVADOR = 20;
const UTC_OFFSET_HOURS = -6;
let running = false;
let timer = null;
function nextRun(now = new Date()) {
    // El Salvador usa UTC-6 todo el año. Las 20:00 locales equivalen a las
    // 02:00 UTC del día siguiente.
    const localNow = new Date(now.getTime() + UTC_OFFSET_HOURS * 60 * 60 * 1000);
    const localTarget = new Date(localNow);
    localTarget.setUTCHours(HOUR_EL_SALVADOR, 0, 0, 0);
    if (localTarget <= localNow)
        localTarget.setUTCDate(localTarget.getUTCDate() + 1);
    return new Date(localTarget.getTime() - UTC_OFFSET_HOURS * 60 * 60 * 1000);
}
async function runDailyAiAnalysis() {
    if (running) {
        console.log('[ai-daily] Se omite la ejecución porque ya hay un análisis activo.');
        return;
    }
    running = true;
    let processed = 0;
    let failed = 0;
    let cursor = 0;
    let consecutiveFailures = 0;
    console.log('[ai-daily] Iniciando análisis automático de incidencias nuevas pendientes.');
    try {
        while (true) {
            const candidates = await db_1.prisma.incident.findMany({
                where: {
                    estado: 'nueva',
                    id: { gt: cursor },
                    OR: [{ aiClassification: null }, { aiClassification: 'REQUIERE_REVISION' }],
                },
                select: { id: true },
                orderBy: { id: 'asc' },
                take: 20,
            });
            if (candidates.length === 0)
                break;
            for (const candidate of candidates) {
                cursor = candidate.id;
                try {
                    await (0, incidence_service_1.classifyStoredIncident)(candidate.id);
                    processed++;
                    consecutiveFailures = 0;
                }
                catch (error) {
                    failed++;
                    consecutiveFailures++;
                    console.error(`[ai-daily] Incidencia ${candidate.id}:`, error);
                    // Una configuración inválida no cambiará durante este proceso.
                    if (error instanceof ai_incidence_classifier_service_1.AiClassifierConfigurationError || consecutiveFailures >= 3) {
                        console.error('[ai-daily] Análisis detenido para evitar repetir un error general del proveedor.');
                        return;
                    }
                }
            }
        }
    }
    finally {
        running = false;
        console.log(`[ai-daily] Finalizado: ${processed} analizadas, ${failed} con error.`);
    }
}
function scheduleNext() {
    const target = nextRun();
    const delay = Math.max(target.getTime() - Date.now(), 1000);
    console.log(`[ai-daily] Próxima ejecución: ${target.toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}.`);
    timer = setTimeout(async () => {
        try {
            await runDailyAiAnalysis();
        }
        catch (error) {
            console.error('[ai-daily] Error inesperado:', error);
        }
        finally {
            scheduleNext();
        }
    }, delay);
}
function startDailyAiAnalysisScheduler() {
    if (timer || process.env.AI_DAILY_ANALYSIS_ENABLED === 'false')
        return;
    scheduleNext();
}
