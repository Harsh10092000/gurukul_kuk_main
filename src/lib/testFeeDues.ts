/**
 * Server-side source of truth for Gurukul Kurukshetra fee dues catalog.
 *
 * CRITICAL SECURITY INVARIANT:
 * The fee amount for any dueId is STRICTLY resolved on the server.
 * Any client-supplied amount parameter in incoming requests is deliberately ignored
 * or validated against this catalog to prevent "Parameter Manipulation - Request Amount Tampering".
 */

export type DueCategory =
  | 'Administrative'
  | 'Academics'
  | 'Hostel & Dining'
  | 'Sports & Gym'
  | 'Labs & Practical'
  | 'Activities & Camp';

export interface FeeDueItem {
  id: string;
  code: string;
  title: string;
  category: DueCategory;
  amount: number; // Strictly controlled test amounts (< ₹100)
  description: string;
  academicTerm: string;
  dueDate: string;
}

export const TEST_FEE_DUES: FeeDueItem[] = [
  {
    id: 'DUE-01',
    code: 'FEE-VRF-01',
    title: 'Registration Verification Token',
    category: 'Administrative',
    amount: 2,
    description: 'Preliminary applicant digital identity and biometric verification charge.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '15 Oct 2026',
  },
  {
    id: 'DUE-02',
    code: 'FEE-DOC-02',
    title: 'Digital Document Authentication Fee',
    category: 'Administrative',
    amount: 5,
    description: 'Secure digital verification of prior school certificate & mark sheet records.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '18 Oct 2026',
  },
  {
    id: 'DUE-03',
    code: 'FEE-LIB-03',
    title: 'Library RFID Smart Card Due',
    category: 'Academics',
    amount: 10,
    description: 'Issuance and chip activation of the campus digital library access card.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '20 Oct 2026',
  },
  {
    id: 'DUE-04',
    code: 'FEE-SPT-04',
    title: 'Sports Facility & Kit Assessment Token',
    category: 'Sports & Gym',
    amount: 12,
    description: 'Athletics field equipment maintenance surcharge and fitness kit token.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '22 Oct 2026',
  },
  {
    id: 'DUE-05',
    code: 'FEE-SEC-05',
    title: 'Campus Security & Identity Badge Fee',
    category: 'Administrative',
    amount: 15,
    description: 'Smart campus ID lanyard, barcode chip, and automated gate security badge.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '25 Oct 2026',
  },
  {
    id: 'DUE-06',
    code: 'FEE-MED-06',
    title: 'Student Medical Fitness Record Charge',
    category: 'Administrative',
    amount: 18,
    description: 'Campus infirmary baseline health checkup and physical fitness record file.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '28 Oct 2026',
  },
  {
    id: 'DUE-07',
    code: 'FEE-HST-07',
    title: 'Hostel Utility & Linen Maintenance Token',
    category: 'Hostel & Dining',
    amount: 20,
    description: 'Residential dormitory utility upkeep, sanitation, and linen laundry token.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '30 Oct 2026',
  },
  {
    id: 'DUE-08',
    code: 'FEE-ICT-08',
    title: 'Computer Lab & ICT Induction Due',
    category: 'Labs & Practical',
    amount: 25,
    description: 'Dedicated computer lab terminal access and educational portal login credential.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '02 Nov 2026',
  },
  {
    id: 'DUE-09',
    code: 'FEE-VED-09',
    title: 'Vedic Studies & Sanskrit Handbook',
    category: 'Academics',
    amount: 30,
    description: 'Traditional Gurukul character building compendium & daily prayer handbook.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '05 Nov 2026',
  },
  {
    id: 'DUE-10',
    code: 'FEE-SCI-10',
    title: 'Science Practical Lab Consumables',
    category: 'Labs & Practical',
    amount: 35,
    description: 'Physics, Chemistry & Biology laboratory experimental apparatus and reagents.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '08 Nov 2026',
  },
  {
    id: 'DUE-11',
    code: 'FEE-ACT-11',
    title: 'Cultural & Co-Curricular Activity Due',
    category: 'Activities & Camp',
    amount: 40,
    description: 'Debating society, fine arts, classical music, and annual festival participation.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '10 Nov 2026',
  },
  {
    id: 'DUE-12',
    code: 'FEE-DIN-12',
    title: 'Dining Hall Services & Maintenance',
    category: 'Hostel & Dining',
    amount: 45,
    description: 'Satvik kitchen dining hall cutlery, RO drinking water, and hygiene surcharge.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '12 Nov 2026',
  },
  {
    id: 'DUE-13',
    code: 'FEE-LAN-13',
    title: 'Language Lab & Audio Material Surcharge',
    category: 'Academics',
    amount: 50,
    description: 'English & Sanskrit speech clarity audio modules and acoustic lab headsets.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '15 Nov 2026',
  },
  {
    id: 'DUE-14',
    code: 'FEE-GYM-14',
    title: 'The Gurukul Swimming Pool & Gym Due',
    category: 'Sports & Gym',
    amount: 55,
    description: 'Certified swimming instructor sessions and indoor gymnasium equipment upkeep.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '18 Nov 2026',
  },
  {
    id: 'DUE-15',
    code: 'FEE-EXM-15',
    title: 'Mid-Term Examination Processing Fee',
    category: 'Academics',
    amount: 65,
    description: 'OMR answer sheet scanning, evaluation grading dossier, and report card print.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '20 Nov 2026',
  },
  {
    id: 'DUE-16',
    code: 'FEE-ROB-16',
    title: 'Robotics & STEM Innovation Workshop',
    category: 'Labs & Practical',
    amount: 75,
    description: 'Microcontroller hardware workshop components, breadboards, and STEM kit.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '25 Nov 2026',
  },
  {
    id: 'DUE-17',
    code: 'FEE-WLF-17',
    title: 'Annual Student Welfare Fund Surcharge',
    category: 'Administrative',
    amount: 80,
    description: 'Institutional emergency medical fund and student welfare amenity contribution.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '28 Nov 2026',
  },
  {
    id: 'DUE-18',
    code: 'FEE-ADM-18',
    title: 'Admit Card Re-generation & Courier Token',
    category: 'Administrative',
    amount: 85,
    description: 'Emergency laminated admit card dispatch, security hologram, and courier token.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '30 Nov 2026',
  },
  {
    id: 'DUE-19',
    code: 'FEE-CMP-19',
    title: 'Orientation Camp Logistics Surcharge',
    category: 'Activities & Camp',
    amount: 92,
    description: 'Annual outdoor spiritual camp logistics, tenting, and excursion transport.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '05 Dec 2026',
  },
  {
    id: 'DUE-20',
    code: 'FEE-DOS-20',
    title: 'Final Admission Dossier Processing Fee',
    category: 'Administrative',
    amount: 99,
    description: 'Permanent enrollment register sealing, board archival, and permanent file due.',
    academicTerm: 'Term 1 (2026-27)',
    dueDate: '10 Dec 2026',
  },
];

export function getTestFeeDue(dueId: string): FeeDueItem | undefined {
  return TEST_FEE_DUES.find((d) => d.id === dueId);
}
