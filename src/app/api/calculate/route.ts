import { NextRequest, NextResponse } from "next/server";
import { calculateGematria, calculateDateNumerology } from "@/lib/gematria";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.text != null) {
    const result = calculateGematria(String(body.text));
    return NextResponse.json({
      type: "text",
      values: {
        ordinal: result.ordinal,
        reduction: result.reduction,
        reverseOrdinal: result.reverseOrdinal,
        reverseReduction: result.reverseReduction,
      },
    });
  }

  if (body.date != null) {
    const parsed = new Date(body.date);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    const result = calculateDateNumerology(parsed);
    return NextResponse.json({
      type: "date",
      values: {
        fullDate: result.full,
        reducedYear: result.reducedYear,
        singleDigits: result.singleDigits,
        shortYear: result.shortYear,
        monthDay: result.monthDay,
        rootNumber: result.rootNumber,
      },
    });
  }

  return NextResponse.json(
    { error: "Provide either { text } or { date }" },
    { status: 400 }
  );
}
