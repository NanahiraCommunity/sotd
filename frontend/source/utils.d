module utils;

@safe:

import std.algorithm;
import std.datetime.systime;
import std.datetime.timezone;
import std.regex;
import std.string;
import taggedalgebraic.taggedalgebraic;
import vibe.core.file;
import vibe.core.path;
import vibe.inet.url;
import vibe.inet.urltransfer;

static immutable htmlRegex = ctRegex!`<.*?>`;

string stripMD(string text)
{
	// XXX: this method is ugly quickly written hack
	import vibe.textfilter.markdown : filterMarkdown;

	auto res = filterMarkdown(text);

	return res.replaceAll(htmlRegex, "");
}

static immutable(TimeZone) JST;

shared static this()
{
	JST = PosixTimeZone.getTimeZone("Japan");
}

SysTime fromUnixTime(ulong t)
{
	return SysTime.fromUnixTime(t / 1000, JST);
}

static immutable ytShortId = ctRegex!`youtu\.be/\b([A-Za-z0-9_-]+)`;
static immutable ytLongId = ctRegex!`[?&]v=([A-Za-z0-9_-]+)`;

string extractYTID(string youtubeLink)
{
	auto m = youtubeLink.matchFirst(youtubeLink.canFind("://youtu.be/") ? ytShortId : ytLongId);
	if (!m)
		return null;
	return m[1];
}

string makeYTEmbed(string youtubeLink)
{
	auto id = extractYTID(youtubeLink);
	return id.length ? "https://www.youtube.com/embed/" ~ id : null;
}

static immutable emojiRegex = ctRegex!`<a href="#">(a?):([^:<&]+):(\d+)</a>`;
string filterMarkdown(string md)
{
	import vibe.textfilter.markdown : filterMarkdown;

	auto res = filterMarkdown(md);

	string embedEmoji(Captures!string m)
	{
		auto animated = m[1].length == 1;
		auto name = m[2];
		auto id = m[3];

		auto filename = animated ? id ~ ".gif" : id ~ ".webp";

		auto url = `https://cdn.discordapp.com/emojis/` ~ filename ~ `?size=96&quality=lossless`;

		ensureFileCached(NativePath("public/emojis/") ~ NativePath.Segment(filename), URL(url));

		return `<img class="emoji" height="20" src="/public/emojis/` ~ filename ~ `" title=":` ~ name ~ `:" alt=":` ~ name ~ `:" />`;
	}

	return res.replaceAll!embedEmoji(emojiRegex);
}

void ensureFileCached(NativePath output, URL url)
{
	if (!existsFile(output))
	{
		download(url, output);
	}
}
