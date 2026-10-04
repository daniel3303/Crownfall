using Crownfall.Server.Matches;
using Crownfall.Sim.Core;
using Microsoft.AspNetCore.Mvc;

namespace Crownfall.Server.Api;

[ApiController]
[Route("api/matches")]
public sealed class MatchesController : ControllerBase
{
    private readonly MatchRegistry _registry;

    public MatchesController(MatchRegistry registry)
    {
        _registry = registry;
    }

    [HttpGet]
    public IActionResult List()
    {
        return Ok(_registry.OpenLobbies().Select(MatchSummary.From));
    }

    [HttpGet("{id}")]
    public IActionResult Show(string id)
    {
        var match = _registry.Get(id);
        return match == null ? NotFound() : Ok(MatchSummary.From(match));
    }

    [HttpPost]
    public IActionResult Create([FromBody] MatchConfig config)
    {
        var match = _registry.Create(config ?? new MatchConfig(), isQuickPlay: false);
        return match == null ? StatusCode(StatusCodes.Status503ServiceUnavailable) : Ok(MatchSummary.From(match));
    }

    [HttpPost("quickplay")]
    public IActionResult QuickPlay()
    {
        var match = _registry.FindOrCreateQuickPlay();
        return match == null ? StatusCode(StatusCodes.Status503ServiceUnavailable) : Ok(MatchSummary.From(match));
    }
}
