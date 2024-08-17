import std.datetime.systime;
import utils;
import vibe.vibe;

static immutable configPath = NativePath("../history.json");

void main()
{
	auto settings = new HTTPServerSettings;
	settings.port = 8080;
	settings.bindAddresses = ["::1", "127.0.0.1"];
	auto router = new URLRouter();
	router.get("/public/*", serveStaticFiles("public", new HTTPFileServerSettings("/public")));
	router.get("/", &index);
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
	string author;
	string raw;
	SotdMessage parsed;
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
