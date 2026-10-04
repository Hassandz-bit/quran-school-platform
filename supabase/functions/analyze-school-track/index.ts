import "jsr:@supabase/functions-js@2.4.6/edge-runtime.d.ts";
import { createSchoolTrackAnalysisHandler } from "./handler.ts";
import { createSchoolTrackAnalysisDependencies } from "./services.ts";

const handler = createSchoolTrackAnalysisHandler(
  createSchoolTrackAnalysisDependencies()
);
Deno.serve(handler);
