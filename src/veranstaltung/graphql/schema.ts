export const typeDefs = /* GraphQL */ `
  type Query {
    veranstaltung(id: ID!): Veranstaltung
    veranstaltungen(input: SuchParameterInput): [Veranstaltung!]!
  }

  type Mutation {
    create(input: VeranstaltungInput!): Veranstaltung
    update(id: ID!, version: Int!, input: VeranstaltungInput!): Veranstaltung
    delete(id: ID!): DeletePayload
    updateOrt(veranstaltungId: ID!, input: OrtInput!): Ort
    deleteOrt(veranstaltungId: ID!): DeletePayload
    createTicket(veranstaltungId: ID!, input: TicketInput!): Ticket
    updateTicket(veranstaltungId: ID!, id: ID!, input: TicketInput!): Ticket
    deleteTicket(veranstaltungId: ID!, id: ID!): DeletePayload
  }

  type DeletePayload {
    success: Boolean!
  }

  input VeranstaltungInput {
    titel: String!
    datum: String!
    kategorie: Kategorie!
    preis: String!
    schlagwoerter: [String!]! = []
  }

  input OrtInput {
    name: String!
    strasse: String!
    plz: String!
    stadt: String!
  }

  input TicketInput {
    bezeichnung: String!
    preis: String!
    kontingent: Int!
    aktiv: Boolean! = true
  }

  type Veranstaltung {
    id: ID!
    version: Int!
    titel: String!
    datum: String!
    kategorie: Kategorie!
    preis: String!
    schlagwoerter: [String!]!
    veranstalterId: String!
    erstellt: String!
    aktualisiert: String!
    ort: Ort
    tickets(limit: Int! = 20, offset: Int! = 0): [Ticket!]!
    ticket(id: ID!): Ticket
  }

  type Ort {
    id: ID!
    name: String!
    strasse: String!
    plz: String!
    stadt: String!
    veranstaltungId: ID!
  }

  type Ticket {
    id: ID!
    bezeichnung: String!
    preis: String!
    kontingent: Int!
    aktiv: Boolean!
    veranstaltungId: ID!
  }

  input SuchParameterInput {
    q: String
    kategorie: Kategorie
    ab: String
    schlagwort: String
    limit: Int! = 20
    offset: Int! = 0
  }

  enum Kategorie {
    KONZERT
    SPORT
    THEATER
    WORKSHOP
    SONSTIGES
  }
`;
