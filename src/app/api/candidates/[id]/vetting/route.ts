import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Standard vetting questions checklist
const VETTING_QUESTIONS = [
  { key: 'ASPIRANT_PRESENT', question: 'Aspirant present in person' },
  { key: 'MEMBERSHIP_ID_SIGHTED', question: 'Party Membership ID Card sighted' },
  { key: 'NAME_MATCHES_REGISTER', question: 'Name matches Party Register' },
  { key: 'NATIONAL_ID_PRESENTED', question: 'National ID (Voters Card or Ghana Card)' },
  { key: 'PHOTO_MATCHES', question: 'Passport photo matches applicant' },
  { key: 'MEMBERSHIP_CONFIRMED', question: 'Membership confirmed at station level' },
];

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const responses = await prisma.vettingQuestion.findMany({
      where: { candidateId: id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(responses);
  } catch (error) {
    console.error('Error fetching vetting questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vetting questions' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { questionKey, response, notes, verifiedBy } = body;

    if (!questionKey) {
      return NextResponse.json(
        { error: 'Question key is required' },
        { status: 400 }
      );
    }

    // Validate questionKey
    const questionConfig = VETTING_QUESTIONS.find((q) => q.key === questionKey);
    if (!questionConfig) {
      return NextResponse.json(
        { error: 'Invalid question key' },
        { status: 400 }
      );
    }

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // Upsert the response
    const existing = await prisma.vettingQuestion.findUnique({
      where: {
        candidateId_questionKey: {
          candidateId: id,
          questionKey,
        },
      },
    });

    let vettingQuestion;
    if (existing) {
      vettingQuestion = await prisma.vettingQuestion.update({
        where: { id: existing.id },
        data: {
          response: response ?? false,
          notes: notes ?? null,
          verifiedBy: verifiedBy || 'Admin',
          verifiedAt: new Date(),
        },
      });
    } else {
      vettingQuestion = await prisma.vettingQuestion.create({
        data: {
          candidateId: id,
          questionKey,
          question: questionConfig.question,
          response: response ?? false,
          notes: notes ?? null,
          verifiedBy: verifiedBy || 'Admin',
        },
      });
    }

    return NextResponse.json(vettingQuestion, { status: 201 });
  } catch (error) {
    console.error('Error saving vetting question:', error);
    return NextResponse.json(
      { error: 'Failed to save vetting question' },
      { status: 500 }
    );
  }
}
