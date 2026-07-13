import { Kysely } from 'kysely';

// Data-only migration: relocates the syllabus/announcement content that used
// to live hardcoded in src/lib/courseData.ts (keyed by class *name*, matched
// via risky substring search) into the real, teacher-editable tables added by
// 005/006 - keyed by class `code` instead, which is a real unique identifier.
// This does not invent any new content; it only moves what a teacher already
// wrote for CS101/CS201 into the store that can now actually be edited.
//
// `linked_assignment_id` is left null for every row here: the legacy
// per-week "linked activities" (e.g. "Course Introduction Survey") have no
// corresponding row in the real `assignments` table, and this migration
// intentionally does not fabricate one.

interface WeekSeed {
  week_number: number;
  title: string;
  topics: string;
  readings: string;
  video_links: string[];
}

interface AnnouncementSeed {
  title: string;
  content: string;
}

const CS101_WEEKS: WeekSeed[] = [
  {
    week_number: 1,
    title: 'Introduction & Internet Architecture',
    topics: 'What is a network, edge vs core, packet switching vs circuit switching, OSI model layers, and TCP/IP stack.',
    readings: 'Kurose & Ross: Chapter 1 (Sections 1.1 - 1.5).',
    video_links: ['OSI Model 7-Layers Animation', 'Packet Switching vs Circuit Switching Fundamentals'],
  },
  {
    week_number: 2,
    title: 'Application Layer Protocols',
    topics: 'Client-server vs P2P paradigms, HTTP/1.1, HTTP/2, HTTP/3, SMTP mail delivery, and DNS domain name system hierarchy.',
    readings: 'Kurose & Ross: Chapter 2 (Sections 2.1 - 2.5).',
    video_links: ['How DNS Works under the hood', 'HTTP/3 over QUIC explained'],
  },
  {
    week_number: 3,
    title: 'Transport Layer (UDP/TCP)',
    topics: 'Multiplexing, UDP structure, reliable data transfer principles (Go-Back-N, Selective Repeat), and TCP connection management.',
    readings: 'Kurose & Ross: Chapter 3 (Sections 3.1 - 3.5).',
    video_links: ['TCP 3-Way Handshake explained', 'TCP Congestion Control (Tahoe vs Reno)'],
  },
  {
    week_number: 4,
    title: 'Network Layer & IP',
    topics: 'Router architecture, IPv4 addressing, subnetting, CIDR notation, NAT traversal, IPv6 headers, and ICMP messaging.',
    readings: 'Kurose & Ross: Chapter 4 (Sections 4.1 - 4.4).',
    video_links: ['IP Subnetting and CIDR Tutorial', 'Wireshark: Analyzing IP Headers'],
  },
  {
    week_number: 5,
    title: 'Routing Algorithms (OSPF, BGP)',
    topics: 'Graph abstractions, Dijkstra link-state algorithm, Bellman-Ford distance-vector routing, autonomous systems, and BGP path-vector routing.',
    readings: 'Kurose & Ross: Chapter 5 (Sections 5.1 - 5.4).',
    video_links: ['BGP Peering Sessions & Route Reflector configuration', 'OSPF Link-State advertisement flow'],
  },
  {
    week_number: 6,
    title: 'Link Layer & LANs',
    topics: 'Error detection (parity, CRC), multiple access protocols (CSMA/CD, CSMA/CA), MAC addressing, ARP resolution, and Ethernet frames.',
    readings: 'Kurose & Ross: Chapter 6 (Sections 6.1 - 6.4).',
    video_links: ['Address Resolution Protocol (ARP) step-by-step', 'VLAN Tagging & Trunking 802.1Q'],
  },
  {
    week_number: 7,
    title: 'Wireless & Mobile Networks',
    topics: '802.11 Wi-Fi physical links, frame types, CSMA/CA backoff, mobility handoffs, and basic cellular 4G/5G data routing.',
    readings: 'Kurose & Ross: Chapter 7 (Sections 7.1 - 7.3).',
    video_links: ['802.11 Association & Probe Requests', 'Wireless WPA3 Security Handshake'],
  },
  {
    week_number: 8,
    title: 'Network Security Principles',
    topics: 'Confidentiality, message integrity, symmetric/asymmetric cryptosystems (AES, RSA), digital signatures, TLS, firewalls, and DDoS mitigation.',
    readings: 'Kurose & Ross: Chapter 8 (Sections 8.1 - 8.6).',
    video_links: ['Diffie-Hellman Key Exchange Math', 'How Firewalls inspect packets'],
  },
  {
    week_number: 9,
    title: 'Advanced Core Architecture Review',
    topics: 'Content Delivery Networks (CDNs), DNS geo-routing, protocol tunneling, performance monitoring tools, and final project presentations.',
    readings: 'Kurose & Ross: Chapter 9 (Sections 9.1 - 9.3).',
    video_links: ['Anycast Routing & CDN Caching topologies'],
  },
];

const CS101_ANNOUNCEMENTS: AnnouncementSeed[] = [
  {
    title: '📢 Welcome to CS101 - Computer Networks!',
    content:
      'Welcome everyone! I am excited to guide you through internet architectures this term. Please review the Course Syllabus tab to understand assignments weights and late policies. Make sure to download Wireshark on your computers, as our transport layer lab in Week 3 will require inspecting real live TCP handshakes.',
  },
  {
    title: '💻 Wireshark Installation Guide & Study Outline',
    content:
      'I have posted the Wireshark setup instructions for both macOS and Windows. If you face installation driver bugs, please contact our TA or post on the course forums. Remember that our upcoming quiz in Week 2 will cover Application Protocols (HTTP, DNS, and SMTP).',
  },
  {
    title: '📅 Midterm Exam & Group Formation Outline',
    content:
      'The Midterm is scheduled for Module 5 and will cover topics from Weeks 1-4. The test is closed book, but you can bring one double-sided letter-size sheet of handwritten notes. Please register your project groups by the end of Week 4.',
  },
];

const CS201_WEEKS: WeekSeed[] = [
  {
    week_number: 1,
    title: 'The Relational Algebra & Schemas',
    topics: 'Introduction to database systems, relational structures, selection, projection, joins, and ER diagrams.',
    readings: 'Silberschatz: Chapter 1 & 2.',
    video_links: ['Relational Algebra Operators visual walkthrough'],
  },
  {
    week_number: 2,
    title: 'Structured Query Language (SQL)',
    topics: 'Basic SELECT-FROM-WHERE blocks, nested subqueries, grouping, and set operations.',
    readings: 'Silberschatz: Chapter 3 & 4.',
    video_links: ['SQL Joins Visualizer Tutorial'],
  },
  {
    week_number: 3,
    title: 'Advanced SQL: Window Functions & CTEs',
    topics: 'Common Table Expressions, partition window aggregations, recursive SQL queries, and views.',
    readings: 'Silberschatz: Chapter 5.',
    video_links: ['Window Functions in PostgreSQL'],
  },
  {
    week_number: 4,
    title: 'Database Normalization',
    topics: 'Functional dependencies, 1NF, 2NF, 3NF, BCNF algorithms, and multi-valued dependencies.',
    readings: 'Silberschatz: Chapter 8.',
    video_links: ['Boyce-Codd Normal Form decomposition rules'],
  },
  {
    week_number: 5,
    title: 'DB Indexing & Physical Storage',
    topics: 'RAID configurations, file storage layout, hash indexing, and B+ Trees node splits.',
    readings: 'Silberschatz: Chapter 12 & 13.',
    video_links: ['B+ Tree Node Splits Animation'],
  },
  {
    week_number: 6,
    title: 'Query Optimization & Execution Plans',
    topics: 'Heuristic optimization, relational equivalences, cost estimations, EXPLAIN query outputs, and nested loop joins.',
    readings: 'Silberschatz: Chapter 15 & 16.',
    video_links: ['EXPLAIN ANALYZE PostgreSQL output reading guide'],
  },
  {
    week_number: 7,
    title: 'ACID Transactions & Lock Gating',
    topics: 'Atomicity, Consistency, Isolation, Durability. Serializability, lock modes, and Two-Phase Locking (2PL).',
    readings: 'Silberschatz: Chapter 17 & 18.',
    video_links: ['Transaction Isolation Levels (Read Committed vs Serializable)'],
  },
  {
    week_number: 8,
    title: 'Crash Recovery Mechanisms',
    topics: 'Log-based recovery, WAL protocol, checkpoints, and ARIES recovery algorithms.',
    readings: 'Silberschatz: Chapter 19.',
    video_links: ['ARIES Recovery Protocol: Analysis, Redo, Undo phases'],
  },
  {
    week_number: 9,
    title: 'Distributed Databases & NoSQL',
    topics: 'CAP Theorem, document databases, key-value caches (Redis), consistent hashing, and horizontal sharding.',
    readings: 'Silberschatz: Chapter 20 & 24.',
    video_links: ['CAP Theorem and Paxos Protocol introduction'],
  },
];

const CS201_ANNOUNCEMENTS: AnnouncementSeed[] = [
  {
    title: '📢 Course Database Server Sandboxes Setup',
    content:
      'Welcome to CS201! All student PostgreSQL sandbox database credentials have been generated and emailed to your address. Please verify that you can connect using pgAdmin or the CLI before our first lab session in Week 2.',
  },
];

const CS101_OVERVIEW =
  'Focus on internet architecture, OSI/TCP-IP networking model, socket programming, congestion control protocols, and network routing security.\n\n' +
  'Required textbook: "Computer Networking: A Top-Down Approach" by Kurose & Ross (8th Edition).\n\n' +
  'Late policy: Late submissions incur a penalty of -10% per 24-hour period up to a maximum of 3 days (72 hours), after which a score of 0 will be assigned.\n\n' +
  'Academic integrity: All submissions must reflect your own individual work. Copying code from external repositories or classmates is strictly prohibited and subject to university disciplinary actions.';

const CS201_OVERVIEW =
  'Explore relational model theory, database normalization rules, advanced structured query design, B+ Tree indexing, and transactions concurrency control.\n\n' +
  'Required textbook: "Database System Concepts" by Silberschatz, Korth & Sudarshan (7th Edition).\n\n' +
  'Late policy: Penalties apply at -10% per day for late database lab reports.\n\n' +
  'Academic integrity: Queries and schemas must be written individually. Query sharing or plagiarizing will result in an immediate 0.';

async function seedForName(
  db: Kysely<any>,
  name: string,
  weeks: WeekSeed[],
  announcements: AnnouncementSeed[],
  overview: string
): Promise<void> {
  const classes = await db
    .selectFrom('classes')
    .select(['id', 'teacher_id'])
    .where('name', '=', name)
    .execute();

  for (const classroom of classes) {
    await db
      .updateTable('classes')
      .set({ syllabus_overview: overview })
      .where('id', '=', classroom.id)
      .execute();

    for (const week of weeks) {
      await db
        .insertInto('syllabus_weeks')
        .values({
          class_id: classroom.id,
          week_number: week.week_number,
          title: week.title,
          topics: week.topics,
          readings: week.readings,
          video_links: JSON.stringify(week.video_links),
        })
        .execute();
    }

    for (const ann of announcements) {
      await db
        .insertInto('class_announcements')
        .values({
          class_id: classroom.id,
          author_id: classroom.teacher_id,
          title: ann.title,
          content: ann.content,
        })
        .execute();
    }
  }
}

async function unseedForName(
  db: Kysely<any>,
  name: string,
  weeks: WeekSeed[],
  announcements: AnnouncementSeed[]
): Promise<void> {
  const classes = await db.selectFrom('classes').select(['id']).where('name', '=', name).execute();

  for (const classroom of classes) {
    for (const week of weeks) {
      await db
        .deleteFrom('syllabus_weeks')
        .where('class_id', '=', classroom.id)
        .where('week_number', '=', week.week_number)
        .execute();
    }

    for (const ann of announcements) {
      await db
        .deleteFrom('class_announcements')
        .where('class_id', '=', classroom.id)
        .where('title', '=', ann.title)
        .execute();
    }

    await db.updateTable('classes').set({ syllabus_overview: null }).where('id', '=', classroom.id).execute();
  }
}

const CS101_NAME = 'CS101 - Computer Networks';
const CS201_NAME = 'CS201 - Database Systems';

export async function up(db: Kysely<any>): Promise<void> {
  await seedForName(db, CS101_NAME, CS101_WEEKS, CS101_ANNOUNCEMENTS, CS101_OVERVIEW);
  await seedForName(db, CS201_NAME, CS201_WEEKS, CS201_ANNOUNCEMENTS, CS201_OVERVIEW);
}

export async function down(db: Kysely<any>): Promise<void> {
  await unseedForName(db, CS101_NAME, CS101_WEEKS, CS101_ANNOUNCEMENTS);
  await unseedForName(db, CS201_NAME, CS201_WEEKS, CS201_ANNOUNCEMENTS);
}
