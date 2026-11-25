export const typeDefs = /* GraphQL */ `
  type Query {
    veranstaltung(id: ID!): Veranstaltung
    veranstaltungen(input: SuchParameterInput): [Veranstaltung!]!
  }

  type Veranstaltung {
    id: ID!
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
