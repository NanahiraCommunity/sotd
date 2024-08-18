import std.datetime.systime;
import utils;
import vibe.vibe;

@safe:

static immutable configPath = NativePath("../history.json");

void main()
{
	auto settings = new HTTPServerSettings;
	settings.port = 8080;
	settings.bindAddresses = ["::1", "127.0.0.1"];
	auto router = new URLRouter();
	router.get("/public/*", serveStaticFiles("public", new HTTPFileServerSettings(
			"/public")));
	router.get("/", &index);
	router.get("/latest.html", &latestEmbed);
	auto listener = listenHTTP(settings, router);
	scope (exit)
	{
		listener.stopListening();
	}

	logInfo("Please open http://127.0.0.1:8080/ in your browser.");
	runApplication();
}

void index(scope HTTPServerRequest req, scope HTTPServerResponse res)
{
	if (handleCacheFile(req, res, configPath, "public", 1.hours))
		return;
	auto today = cast(Date) Clock.currTime(JST);
	auto yesterday = today - 1.days;
	auto history = .history;
	res.render!("index.dt", history, today, yesterday);
}

void latestEmbed(scope HTTPServerRequest req, scope HTTPServerResponse res)
{
	if (handleCacheFile(req, res, configPath, "public", 1.hours))
		return;
	auto today = cast(Date) Clock.currTime(JST);
	auto yesterday = today - 1.days;
	History latest = history[$ - 1];
	auto ytid = extractYTID(latest.parsed.youtube);
	if (latest.date == today || latest.date == yesterday)
	{
		string thumbnail = "https://sotd.nanahira.community/public/fallback-thumb.png";
		if (ytid.length)
		{
			auto file = NativePath("public/thumbnails") ~ NativePath.Segment(
				format!"%s-%s.jpg"(latest.author_id, latest.parsed.counter));
			ensureFileCached(file, URL("https://img.youtube.com/vi/" ~ ytid
					~ "/maxresdefault.jpg"));
			thumbnail = "https://sotd.nanahira.community/" ~ file
				.toNativeString;
		}
		res.writeBody(format!`<h3>SOTD %s / #%s - %s</h3><a href="%s"><img class="thumbnail" src="%s" alt="%s"></a>`(
				latest.date,
				latest.parsed.counter,
				latest.parsed.name,
				latest.parsed.youtube,
				thumbnail,
				latest.parsed.name,
		), "text/html; charset=UTF-8");
	}
	else
	{
		res.writeBody("", "text/html");
	}
}

History[] history()
{
	static History[] loaded;
	static SysTime modDate;

	auto fi = getFileInfo(configPath);
	if (fi.timeModified == modDate)
		return loaded;

	modDate = fi.timeModified;
	return loaded = deserializeJson!(History[])(readFileUTF8(configPath));
}

struct History
{
	ulong dt;
	string url;
	string author;
	string author_id;
	string raw;
	SotdMessage parsed;

	Date date() const @property
	{
		return cast(Date) fromUnixTime(dt);
	}
}

struct SotdMessage
{
	uint counter;
@optional:
	string name;
	string source;
	string releaseDate;
	string composer;
	string singers;
	string links;
	string youtube;
	string lyrics;
	string description;
}
