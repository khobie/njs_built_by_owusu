import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; reportId: string } }
) {
  try {
    const { reportId } = params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.content !== undefined) updateData.content = body.content;
    if (body.reportType !== undefined) updateData.reportType = body.reportType;
    if (body.authorName !== undefined) updateData.authorName = body.authorName;
    if (body.isResolved !== undefined) updateData.isResolved = body.isResolved;

    const report = await prisma.candidateReport.update({
      where: { id: reportId },
      data: updateData,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error updating report:', error);
    return NextResponse.json(
      { error: 'Failed to update report' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; reportId: string } }
) {
  try {
    const { reportId } = params;

    await prisma.candidateReport.delete({
      where: { id: reportId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    return NextResponse.json(
      { error: 'Failed to delete report' },
      { status: 500 }
    );
  }
}

