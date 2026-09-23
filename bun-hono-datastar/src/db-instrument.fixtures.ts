/**
 * Statements copied from production traces (Axiom, `db.query.text`), one or
 * more per statement shape the app issues, each with the summary
 * `summarizeSql` must give it. Several entries share a summary on purpose:
 * chunks of a multi-row insert of different sizes and null patterns, `in`
 * lists of different lengths, and the per-cinema `or` branches of the
 * screenings filter all have to group together in Axiom.
 */
export const productionStatements: { query: string; summary: string }[] = [
  {
    query:
      'select distinct "language" from "Screening" where (("Screening"."deletedAt" is null) and ("Screening"."language" is not null))',
    summary:
      'select distinct "language" from "Screening" where (("Screening"."deletedAt" is null) and ("Screening"."language" is not null))',
  },
  {
    query: 'select "id", "name", "city", "chain" from "Cinema"',
    summary: 'select "id", "name", "city", "chain" from "Cinema"',
  },
  {
    query:
      'select "id", "name", "city", "chain" from "Cinema" where "Cinema"."id" not in (?)',
    summary:
      'select "id", "name", "city", "chain" from "Cinema" where "Cinema"."id" not in (?)',
  },
  {
    query:
      'insert into "MovieTitle" ("id", "movieId", "title", "searchText", "source", "createdAt") values (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())) on conflict do nothing',
    summary:
      'insert into "MovieTitle" ("id", "movieId", "title", "searchText", "source", "createdAt") values (?) on conflict do nothing',
  },
  {
    query:
      'insert into "MovieTitle" ("id", "movieId", "title", "searchText", "source", "createdAt") values (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())) on conflict do nothing',
    summary:
      'insert into "MovieTitle" ("id", "movieId", "title", "searchText", "source", "createdAt") values (?) on conflict do nothing',
  },
  {
    query:
      'insert into "MovieTitle" ("id", "movieId", "title", "searchText", "source", "createdAt") values (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())), (null, ?, ?, ?, ?, (unixepoch())) on conflict do nothing',
    summary:
      'insert into "MovieTitle" ("id", "movieId", "title", "searchText", "source", "createdAt") values (?) on conflict do nothing',
  },
  {
    query:
      'select "id", "normalizedTitle", "tmdbId", "tmdbAttemptedAt" from "Movie" where "Movie"."normalizedTitle" in (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    summary:
      'select "id", "normalizedTitle", "tmdbId", "tmdbAttemptedAt" from "Movie" where "Movie"."normalizedTitle" in (?)',
  },
  {
    query:
      'select "id", "uniqueId", "startTime", "hash", "bookingUrl" from "Screening" where ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" <= ? and ("Screening"."deletedAt" is null))',
    summary:
      'select "id", "uniqueId", "startTime", "hash", "bookingUrl" from "Screening" where ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" <= ? and ("Screening"."deletedAt" is null))',
  },
  {
    query: 'select "language" from "ScreeningLanguage"',
    summary: 'select "language" from "ScreeningLanguage"',
  },
  {
    query:
      'select "language" from "ScreeningLanguage" where "ScreeningLanguage"."language" in (?, ?)',
    summary:
      'select "language" from "ScreeningLanguage" where "ScreeningLanguage"."language" in (?)',
  },
  {
    query:
      'select "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude" from "Cinema"',
    summary:
      'select "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude" from "Cinema"',
  },
  {
    query:
      'select "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude" from "Cinema" where ("Cinema"."chain" = ? and "Cinema"."country" = ? and "Cinema"."siteId" in (?))',
    summary:
      'select "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude" from "Cinema" where ("Cinema"."chain" = ? and "Cinema"."country" = ? and "Cinema"."siteId" in (?))',
  },
  {
    query:
      'select "title", "durationMinutes" from "Screening" where ("Screening"."movieId" = ? and ("Screening"."deletedAt" is null)) order by "Screening"."startTime" desc limit ?',
    summary:
      'select "title", "durationMinutes" from "Screening" where ("Screening"."movieId" = ? and ("Screening"."deletedAt" is null)) order by "Screening"."startTime" desc limit ?',
  },
  {
    query:
      'select "Movie"."id", "MovieInfo"."id", "MovieInfo"."tmdbId", "MovieInfo"."language", "MovieInfo"."title", "MovieInfo"."originalTitle", "MovieInfo"."originalLanguage", "MovieInfo"."overview", "MovieInfo"."genres", "MovieInfo"."releaseDate", "MovieInfo"."runtimeMinutes", "MovieInfo"."voteAverage", "MovieInfo"."voteCount", "MovieInfo"."posterPath", "MovieInfo"."backdropPath", "MovieInfo"."director", "MovieInfo"."cast", "MovieInfo"."videos", "MovieInfo"."imdbId", "MovieInfo"."updatedAt", "MovieInfo"."createdAt" from "Movie" inner join "MovieInfo" on "Movie"."tmdbId" = "MovieInfo"."tmdbId" where "Movie"."id" in (?)',
    summary:
      'select "Movie"."id", "MovieInfo"."id", "MovieInfo"."tmdbId", "MovieInfo"."language", "MovieInfo"."title", "MovieInfo"."originalTitle", "MovieInfo"."originalLanguage", "MovieInfo"."overview", "MovieInfo"."genres", "MovieInfo"."releaseDate", "MovieInfo"."runtimeMinutes", "MovieInfo"."voteAverage", "MovieInfo"."voteCount", "MovieInfo"."posterPath", "MovieInfo"."backdropPath", "MovieInfo"."director", "MovieInfo"."cast", "MovieInfo"."videos", "MovieInfo"."imdbId", "MovieInfo"."updatedAt", "MovieInfo"."createdAt" from "Movie" inner join "MovieInfo" on "Movie"."tmdbId" = "MovieInfo"."tmdbId" where "Movie"."id" in (?)',
  },
  {
    query:
      'select "normalizedTitle" from "Movie" where "Movie"."id" = ? limit ?',
    summary:
      'select "normalizedTitle" from "Movie" where "Movie"."id" = ? limit ?',
  },
  {
    query:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null))',
    summary:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null))',
  },
  {
    query:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."id" in (?))',
    summary:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."id" in (?))',
  },
  {
    query:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?))',
    summary:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?))',
  },
  {
    query:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?, ?) and "Screening"."audioType" in (?))',
    summary:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?) and "Screening"."audioType" in (?))',
  },
  {
    query:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?)))',
    summary:
      'select "Screening"."id", "Screening"."title", "Screening"."startTime", "Screening"."cinemaId", "Screening"."uniqueId", "Screening"."durationMinutes", "Screening"."releaseYear", "Screening"."videoTypes", "Screening"."audioType", "Screening"."language", "Screening"."level", "Screening"."tags", "Screening"."posterUrl", "Screening"."bookingUrl", "Screening"."hash", "Screening"."movieId", "Screening"."deletedAt", "Screening"."updatedAt", "Screening"."createdAt", "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?)))',
  },
  {
    query:
      'insert into "MovieInfo" ("id", "tmdbId", "language", "title", "originalTitle", "originalLanguage", "overview", "genres", "releaseDate", "runtimeMinutes", "voteAverage", "voteCount", "posterPath", "backdropPath", "director", "cast", "videos", "imdbId", "updatedAt", "createdAt") values (null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (unixepoch())) on conflict ("MovieInfo"."tmdbId", "MovieInfo"."language") do update set "title" = ?, "originalTitle" = ?, "originalLanguage" = ?, "overview" = ?, "genres" = ?, "releaseDate" = ?, "runtimeMinutes" = ?, "voteAverage" = ?, "voteCount" = ?, "posterPath" = ?, "backdropPath" = ?, "director" = ?, "cast" = ?, "videos" = ?, "imdbId" = ?, "updatedAt" = ?',
    summary:
      'insert into "MovieInfo" ("id", "tmdbId", "language", "title", "originalTitle", "originalLanguage", "overview", "genres", "releaseDate", "runtimeMinutes", "voteAverage", "voteCount", "posterPath", "backdropPath", "director", "cast", "videos", "imdbId", "updatedAt", "createdAt") values (?) on conflict ("MovieInfo"."tmdbId", "MovieInfo"."language") do update set "title" = ?, "originalTitle" = ?, "originalLanguage" = ?, "overview" = ?, "genres" = ?, "releaseDate" = ?, "runtimeMinutes" = ?, "voteAverage" = ?, "voteCount" = ?, "posterPath" = ?, "backdropPath" = ?, "director" = ?, "cast" = ?, "videos" = ?, "imdbId" = ?, "updatedAt" = ?',
  },
  {
    query:
      'select "Movie"."id", "MovieInfo"."language", "MovieInfo"."title", "MovieInfo"."originalTitle", "MovieInfo"."originalLanguage", "MovieInfo"."posterPath", "MovieInfo"."backdropPath", "MovieInfo"."releaseDate", "MovieInfo"."voteAverage", "MovieInfo"."genres" from "Movie" inner join "MovieInfo" on "Movie"."tmdbId" = "MovieInfo"."tmdbId" where "Movie"."id" in (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    summary:
      'select "Movie"."id", "MovieInfo"."language", "MovieInfo"."title", "MovieInfo"."originalTitle", "MovieInfo"."originalLanguage", "MovieInfo"."posterPath", "MovieInfo"."backdropPath", "MovieInfo"."releaseDate", "MovieInfo"."voteAverage", "MovieInfo"."genres" from "Movie" inner join "MovieInfo" on "Movie"."tmdbId" = "MovieInfo"."tmdbId" where "Movie"."id" in (?)',
  },
  {
    query:
      'select "Screening"."movieId", max("Screening"."title"), "Screening"."posterUrl", max("Screening"."startTime"), "Cinema"."chain" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?, ?) and "Screening"."startTime" >= ? and ("Screening"."posterUrl" is not null) and "Screening"."posterUrl" <> ? and ("Screening"."deletedAt" is null)) group by "Screening"."movieId", "Screening"."posterUrl", "Cinema"."chain"',
    summary:
      'select "Screening"."movieId", max("Screening"."title"), "Screening"."posterUrl", max("Screening"."startTime"), "Cinema"."chain" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?) and "Screening"."startTime" >= ? and ("Screening"."posterUrl" is not null) and "Screening"."posterUrl" <> ? and ("Screening"."deletedAt" is null)) group by "Screening"."movieId", "Screening"."posterUrl", "Cinema"."chain"',
  },
  {
    query:
      'select "Screening"."movieId", max("Screening"."title"), "Screening"."posterUrl", max("Screening"."startTime"), "Cinema"."chain" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?) and "Screening"."startTime" >= ? and ("Screening"."posterUrl" is not null) and "Screening"."posterUrl" <> ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?, ?)) group by "Screening"."movieId", "Screening"."posterUrl", "Cinema"."chain"',
    summary:
      'select "Screening"."movieId", max("Screening"."title"), "Screening"."posterUrl", max("Screening"."startTime"), "Cinema"."chain" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?) and "Screening"."startTime" >= ? and ("Screening"."posterUrl" is not null) and "Screening"."posterUrl" <> ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?)) group by "Screening"."movieId", "Screening"."posterUrl", "Cinema"."chain"',
  },
  {
    query:
      'select "Screening"."movieId", max("Screening"."title"), "Screening"."posterUrl", max("Screening"."startTime"), "Cinema"."chain" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where (("Screening"."deletedAt" is null) and "Screening"."movieId" in (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) and "Screening"."startTime" >= ? and ("Screening"."posterUrl" is not null) and "Screening"."posterUrl" <> ?) group by "Screening"."movieId", "Screening"."posterUrl", "Cinema"."chain"',
    summary:
      'select "Screening"."movieId", max("Screening"."title"), "Screening"."posterUrl", max("Screening"."startTime"), "Cinema"."chain" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where (("Screening"."deletedAt" is null) and "Screening"."movieId" in (?) and "Screening"."startTime" >= ? and ("Screening"."posterUrl" is not null) and "Screening"."posterUrl" <> ?) group by "Screening"."movieId", "Screening"."posterUrl", "Cinema"."chain"',
  },
  {
    query:
      'select "Screening"."movieId", max("Screening"."title"), "Screening"."posterUrl", max("Screening"."startTime"), "Cinema"."chain" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?, ?) and "Screening"."startTime" >= ? and ("Screening"."posterUrl" is not null) and "Screening"."posterUrl" <> ? and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?))) group by "Screening"."movieId", "Screening"."posterUrl", "Cinema"."chain"',
    summary:
      'select "Screening"."movieId", max("Screening"."title"), "Screening"."posterUrl", max("Screening"."startTime"), "Cinema"."chain" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?) and "Screening"."startTime" >= ? and ("Screening"."posterUrl" is not null) and "Screening"."posterUrl" <> ? and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?))) group by "Screening"."movieId", "Screening"."posterUrl", "Cinema"."chain"',
  },
  {
    query: 'update "Movie" set "tmdbAttemptedAt" = ? where "Movie"."id" = ?',
    summary: 'update "Movie" set "tmdbAttemptedAt" = ? where "Movie"."id" = ?',
  },
  {
    query:
      'select "id", (select max("startTime") from "Screening" where "cinemaId" = "Cinema"."id" and "deletedAt" is null) from "Cinema"',
    summary:
      'select "id", (select max("startTime") from "Screening" where "cinemaId" = "Cinema"."id" and "deletedAt" is null) from "Cinema"',
  },
  {
    query:
      'select "movieId", "cinemaId", sum("startTime" < ?), sum("startTime" >= ?), min(case when "startTime" >= ? then "startTime" end) from "Screening" where (("Screening"."deletedAt" is null) and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) group by "Screening"."movieId", "Screening"."cinemaId"',
    summary:
      'select "movieId", "cinemaId", sum("startTime" < ?), sum("startTime" >= ?), min(case when "startTime" >= ? then "startTime" end) from "Screening" where (("Screening"."deletedAt" is null) and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) group by "Screening"."movieId", "Screening"."cinemaId"',
  },
  {
    query:
      'select "Screening"."movieId", min("Screening"."startTime") from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."startTime" >= ? and "Screening"."startTime" < ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?)) group by "Screening"."movieId"',
    summary:
      'select "Screening"."movieId", min("Screening"."startTime") from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."startTime" >= ? and "Screening"."startTime" < ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?)) group by "Screening"."movieId"',
  },
  {
    query:
      'select "id", "tmdbId", (select "title" from "Screening" where "Screening"."movieId" = "Movie"."id" and "Screening"."deletedAt" is null and "startTime" >= ? order by "startTime" limit 1), (select min("startTime") from "Screening" where "Screening"."movieId" = "Movie"."id" and "Screening"."deletedAt" is null and "startTime" >= ?), exists(select 1 from "Screening" where "Screening"."movieId" = "Movie"."id" and "Screening"."deletedAt" is null and "startTime" < ?), (select "releaseDate" from "MovieInfo" where "tmdbId" = "Movie"."tmdbId" and "releaseDate" is not null limit 1) from "Movie" where "Movie"."id" in (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    summary:
      'select "id", "tmdbId", (select "title" from "Screening" where "Screening"."movieId" = "Movie"."id" and "Screening"."deletedAt" is null and "startTime" >= ? order by "startTime" limit 1), (select min("startTime") from "Screening" where "Screening"."movieId" = "Movie"."id" and "Screening"."deletedAt" is null and "startTime" >= ?), exists(select 1 from "Screening" where "Screening"."movieId" = "Movie"."id" and "Screening"."deletedAt" is null and "startTime" < ?), (select "releaseDate" from "MovieInfo" where "tmdbId" = "Movie"."tmdbId" and "releaseDate" is not null limit 1) from "Movie" where "Movie"."id" in (?)',
  },
  {
    query:
      'select "movieId", "cinemaId", "startTime" from "Screening" where (("Screening"."deletedAt" is null) and "Screening"."startTime" >= ?)',
    summary:
      'select "movieId", "cinemaId", "startTime" from "Screening" where (("Screening"."deletedAt" is null) and "Screening"."startTime" >= ?)',
  },
  {
    query:
      'select "id", "tmdbId" from "Movie" where "Movie"."tmdbId" in (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    summary: 'select "id", "tmdbId" from "Movie" where "Movie"."tmdbId" in (?)',
  },
  {
    query:
      'select "tmdbId", "title", "originalTitle" from "MovieInfo" where "MovieInfo"."tmdbId" in (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    summary:
      'select "tmdbId", "title", "originalTitle" from "MovieInfo" where "MovieInfo"."tmdbId" in (?)',
  },
  {
    query:
      'select "Movie"."id", "MovieInfo"."language", "MovieInfo"."title", "MovieInfo"."originalTitle", "MovieInfo"."originalLanguage", "MovieInfo"."posterPath" from "Movie" inner join "MovieInfo" on "Movie"."tmdbId" = "MovieInfo"."tmdbId" where "Movie"."id" in (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    summary:
      'select "Movie"."id", "MovieInfo"."language", "MovieInfo"."title", "MovieInfo"."originalTitle", "MovieInfo"."originalLanguage", "MovieInfo"."posterPath" from "Movie" inner join "MovieInfo" on "Movie"."tmdbId" = "MovieInfo"."tmdbId" where "Movie"."id" in (?)',
  },
  {
    query:
      'insert into "Screening" ("id", "title", "startTime", "cinemaId", "uniqueId", "durationMinutes", "releaseYear", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "hash", "movieId", "deletedAt", "updatedAt", "createdAt") values (null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())) on conflict ("Screening"."cinemaId", "Screening"."uniqueId") do update set "title" = excluded."title", "startTime" = excluded."startTime", "durationMinutes" = excluded."durationMinutes", "releaseYear" = excluded."releaseYear", "videoTypes" = excluded."videoTypes", "audioType" = excluded."audioType", "language" = excluded."language", "level" = excluded."level", "tags" = excluded."tags", "posterUrl" = excluded."posterUrl", "bookingUrl" = coalesce(excluded."bookingUrl", "Screening"."bookingUrl"), "hash" = excluded."hash", "movieId" = excluded."movieId", "deletedAt" = ?, "updatedAt" = ?',
    summary:
      'insert into "Screening" ("id", "title", "startTime", "cinemaId", "uniqueId", "durationMinutes", "releaseYear", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "hash", "movieId", "deletedAt", "updatedAt", "createdAt") values (?) on conflict ("Screening"."cinemaId", "Screening"."uniqueId") do update set "title" = excluded."title", "startTime" = excluded."startTime", "durationMinutes" = excluded."durationMinutes", "releaseYear" = excluded."releaseYear", "videoTypes" = excluded."videoTypes", "audioType" = excluded."audioType", "language" = excluded."language", "level" = excluded."level", "tags" = excluded."tags", "posterUrl" = excluded."posterUrl", "bookingUrl" = coalesce(excluded."bookingUrl", "Screening"."bookingUrl"), "hash" = excluded."hash", "movieId" = excluded."movieId", "deletedAt" = ?, "updatedAt" = ?',
  },
  {
    query:
      'insert into "Screening" ("id", "title", "startTime", "cinemaId", "uniqueId", "durationMinutes", "releaseYear", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "hash", "movieId", "deletedAt", "updatedAt", "createdAt") values (null, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())), (null, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch())) on conflict ("Screening"."cinemaId", "Screening"."uniqueId") do update set "title" = excluded."title", "startTime" = excluded."startTime", "durationMinutes" = excluded."durationMinutes", "releaseYear" = excluded."releaseYear", "videoTypes" = excluded."videoTypes", "audioType" = excluded."audioType", "language" = excluded."language", "level" = excluded."level", "tags" = excluded."tags", "posterUrl" = excluded."posterUrl", "bookingUrl" = coalesce(excluded."bookingUrl", "Screening"."bookingUrl"), "hash" = excluded."hash", "movieId" = excluded."movieId", "deletedAt" = ?, "updatedAt" = ?',
    summary:
      'insert into "Screening" ("id", "title", "startTime", "cinemaId", "uniqueId", "durationMinutes", "releaseYear", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "hash", "movieId", "deletedAt", "updatedAt", "createdAt") values (?) on conflict ("Screening"."cinemaId", "Screening"."uniqueId") do update set "title" = excluded."title", "startTime" = excluded."startTime", "durationMinutes" = excluded."durationMinutes", "releaseYear" = excluded."releaseYear", "videoTypes" = excluded."videoTypes", "audioType" = excluded."audioType", "language" = excluded."language", "level" = excluded."level", "tags" = excluded."tags", "posterUrl" = excluded."posterUrl", "bookingUrl" = coalesce(excluded."bookingUrl", "Screening"."bookingUrl"), "hash" = excluded."hash", "movieId" = excluded."movieId", "deletedAt" = ?, "updatedAt" = ?',
  },
  {
    query:
      'update "Movie" set "tmdbId" = ?, "tmdbAttemptedAt" = ? where "Movie"."id" = ?',
    summary:
      'update "Movie" set "tmdbId" = ?, "tmdbAttemptedAt" = ? where "Movie"."id" = ?',
  },
  {
    query:
      'select "movieId", "title" from "MovieTitle" where "MovieTitle"."searchText" like ?',
    summary:
      'select "movieId", "title" from "MovieTitle" where "MovieTitle"."searchText" like ?',
  },
  {
    query:
      'insert into "Cinema" ("id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude") values (null, ?, ?, ?, ?, ?, (unixepoch()), ?, ?, ?) on conflict ("Cinema"."chain", "Cinema"."country", "Cinema"."siteId") do update set "name" = excluded."name", "city" = coalesce(excluded."city", "Cinema"."city"), "timezone" = coalesce(excluded."timezone", "Cinema"."timezone"), "latitude" = coalesce(excluded."latitude", "Cinema"."latitude"), "longitude" = coalesce(excluded."longitude", "Cinema"."longitude") returning "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude"',
    summary:
      'insert into "Cinema" ("id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude") values (?) on conflict ("Cinema"."chain", "Cinema"."country", "Cinema"."siteId") do update set "name" = excluded."name", "city" = coalesce(excluded."city", "Cinema"."city"), "timezone" = coalesce(excluded."timezone", "Cinema"."timezone"), "latitude" = coalesce(excluded."latitude", "Cinema"."latitude"), "longitude" = coalesce(excluded."longitude", "Cinema"."longitude") returning "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude"',
  },
  {
    query:
      'insert into "Cinema" ("id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude") values (null, ?, ?, ?, ?, ?, (unixepoch()), ?, null, null) on conflict ("Cinema"."chain", "Cinema"."country", "Cinema"."siteId") do update set "name" = excluded."name", "city" = coalesce(excluded."city", "Cinema"."city"), "timezone" = coalesce(excluded."timezone", "Cinema"."timezone"), "latitude" = coalesce(excluded."latitude", "Cinema"."latitude"), "longitude" = coalesce(excluded."longitude", "Cinema"."longitude") returning "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude"',
    summary:
      'insert into "Cinema" ("id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude") values (?) on conflict ("Cinema"."chain", "Cinema"."country", "Cinema"."siteId") do update set "name" = excluded."name", "city" = coalesce(excluded."city", "Cinema"."city"), "timezone" = coalesce(excluded."timezone", "Cinema"."timezone"), "latitude" = coalesce(excluded."latitude", "Cinema"."latitude"), "longitude" = coalesce(excluded."longitude", "Cinema"."longitude") returning "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude"',
  },
  {
    query:
      'select "id", "normalizedTitle" from "Movie" where (("Movie"."tmdbId" is null) and (("Movie"."tmdbAttemptedAt" is null) or "Movie"."tmdbAttemptedAt" < ?) and "Movie"."id" in (select distinct "movieId" from "Screening" where ("Screening"."startTime" >= ? and ("Screening"."deletedAt" is null)) order by "Screening"."movieId" asc))',
    summary:
      'select "id", "normalizedTitle" from "Movie" where (("Movie"."tmdbId" is null) and (("Movie"."tmdbAttemptedAt" is null) or "Movie"."tmdbAttemptedAt" < ?) and "Movie"."id" in (select distinct "movieId" from "Screening" where ("Screening"."startTime" >= ? and ("Screening"."deletedAt" is null)) order by "Screening"."movieId" asc))',
  },
  {
    query:
      'select "tmdbId", "language" from "MovieInfo" where ((("MovieInfo"."originalLanguage" is null) or "MovieInfo"."updatedAt" < ?) and "MovieInfo"."tmdbId" in (select "Movie"."tmdbId" from "Movie" inner join "Screening" on "Screening"."movieId" = "Movie"."id" where ("Screening"."startTime" >= ? and ("Screening"."deletedAt" is null))))',
    summary:
      'select "tmdbId", "language" from "MovieInfo" where ((("MovieInfo"."originalLanguage" is null) or "MovieInfo"."updatedAt" < ?) and "MovieInfo"."tmdbId" in (select "Movie"."tmdbId" from "Movie" inner join "Screening" on "Screening"."movieId" = "Movie"."id" where ("Screening"."startTime" >= ? and ("Screening"."deletedAt" is null))))',
  },
  {
    query:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where (false and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null)) group by "Screening"."movieId"',
    summary:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where (false and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null)) group by "Screening"."movieId"',
  },
  {
    query:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where (false and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?, ?)) group by "Screening"."movieId"',
    summary:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where (false and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?)) group by "Screening"."movieId"',
  },
  {
    query:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?, ?, ?, ?, ?) and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null)) group by "Screening"."movieId"',
    summary:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?) and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null)) group by "Screening"."movieId"',
  },
  {
    query:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?, ?, ?, ?, ?) and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?, ?)) group by "Screening"."movieId"',
    summary:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?) and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and "Cinema"."city" in (?)) group by "Screening"."movieId"',
  },
  {
    query:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where (false and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?))) group by "Screening"."movieId"',
    summary:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where (false and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?))) group by "Screening"."movieId"',
  },
  {
    query:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?, ?) and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?))) group by "Screening"."movieId"',
    summary:
      'select "Screening"."movieId", min("Screening"."startTime"), "Cinema"."id", "Cinema"."name", "Cinema"."city", "Cinema"."chain", "Cinema"."country", "Cinema"."siteId", "Cinema"."createdAt", "Cinema"."timezone", "Cinema"."latitude", "Cinema"."longitude" from "Screening" inner join "Cinema" on "Screening"."cinemaId" = "Cinema"."id" where ("Screening"."movieId" in (?) and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?))) group by "Screening"."movieId"',
  },
  {
    query: 'select "id", "timezone" from "Cinema"',
    summary: 'select "id", "timezone" from "Cinema"',
  },
  {
    query: 'select "id", "timezone" from "Cinema" where "Cinema"."city" in (?)',
    summary:
      'select "id", "timezone" from "Cinema" where "Cinema"."city" in (?)',
  },
  {
    query:
      'insert into "Movie" ("id", "normalizedTitle", "tmdbId", "tmdbAttemptedAt") values (null, ?, null, null), (null, ?, null, null) on conflict do nothing returning "id", "normalizedTitle", "tmdbId", "tmdbAttemptedAt"',
    summary:
      'insert into "Movie" ("id", "normalizedTitle", "tmdbId", "tmdbAttemptedAt") values (?) on conflict do nothing returning "id", "normalizedTitle", "tmdbId", "tmdbAttemptedAt"',
  },
  {
    query:
      'select "movieId", "title", "durationMinutes", "releaseYear", "audioType", "language", "startTime" from "Screening" where ("Screening"."movieId" in (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) and ("Screening"."deletedAt" is null))',
    summary:
      'select "movieId", "title", "durationMinutes", "releaseYear", "audioType", "language", "startTime" from "Screening" where ("Screening"."movieId" in (?) and ("Screening"."deletedAt" is null))',
  },
  {
    query:
      'select "id" from "Screening" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null)) limit ?',
    summary:
      'select "id" from "Screening" where ("Screening"."movieId" = ? and "Screening"."startTime" >= ? and ("Screening"."deletedAt" is null)) limit ?',
  },
  {
    query:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where (("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) and ("Screening"."deletedAt" is null))',
    summary:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where (("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) and ("Screening"."deletedAt" is null))',
  },
  {
    query:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null))',
    summary:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null))',
  },
  {
    query:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null))',
    summary:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null))',
  },
  {
    query:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null))',
    summary:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null))',
  },
  {
    query:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?)))',
    summary:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?)))',
  },
  {
    query:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?)))',
    summary:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null) and exists (select 1 from json_each("Screening"."videoTypes") where json_each.value in (?)))',
  },
  {
    query:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?) or ("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null) and "Screening"."audioType" in (?))',
    summary:
      'select "id", "title", "startTime", "cinemaId", "durationMinutes", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "movieId" from "Screening" where ((("Screening"."cinemaId" = ? and "Screening"."startTime" >= ? and "Screening"."startTime" < ?)) and ("Screening"."deletedAt" is null) and "Screening"."audioType" in (?))',
  },
  {
    query:
      'insert into "ScreeningLanguage" ("language") values (?) on conflict do nothing returning "language"',
    summary:
      'insert into "ScreeningLanguage" ("language") values (?) on conflict do nothing returning "language"',
  },
  {
    query:
      'update "Screening" set "deletedAt" = ? where "Screening"."id" in (?)',
    summary:
      'update "Screening" set "deletedAt" = ? where "Screening"."id" in (?)',
  },
  {
    query:
      'select "id", "name", "chain" from "Cinema" where "Cinema"."id" in (?)',
    summary:
      'select "id", "name", "chain" from "Cinema" where "Cinema"."id" in (?)',
  },
];
