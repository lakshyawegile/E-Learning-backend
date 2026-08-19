// Run in mongosh against your Courses DB:
// mongosh "<your-uri>" --file scripts/seed-news-insertMany.js
// Or paste the insertMany(...) block into MongoDB Compass / mongosh.

db.news.insertMany([
  {
    organizationId: ObjectId("6972184e424ea4761fff6655"),
    title: "India Trade Deficit Hits 5-Month High at $30.4bn",
    description: "June imports surged 31% on oil, gold and electronics, even as goods exports rose 15.5%.",
    content: "India's merchandise trade deficit widened to a five-month high of about $30.43 billion in June 2026. Goods exports rose 15.5% year-on-year to $40.41 billion, but imports jumped about 31% to roughly $70.8 billion.\n\nCrude oil, gold and electronics were the main drivers of higher imports. Crude oil imports alone rose about 40% to $19.32 billion. Fertilizer imports also jumped sharply.\n\nFor importers, this means tighter working capital and higher landed costs if global prices stay elevated. Exporters still saw solid growth in engineering and electronics, but the wider deficit will keep pressure on the currency and logistics planning.\n\nTakeaway: review LC/credit limits for oil, electronics and fertilizer cargoes, and watch June freight and duty cash-flow closely.",
    imageUrl: "",
    linkUrl: "https://economictimes.indiatimes.com/news/economy/foreign-trade/indias-june-exports-shine-through-west-asia-dark-clouds-trade-deficit-widens-to-five-month-high/articleshow/132376014.cms",
    tags: ["trade-deficit", "imports", "exports", "oil"],
    isPublished: true,
    createdBy: ObjectId("69b6578559e99879ce2182bd"),
    createdAt: ISODate("2026-07-14T04:00:00.000Z"),
    updatedAt: ISODate("2026-07-14T04:00:00.000Z")
  },
  {
    organizationId: ObjectId("6972184e424ea4761fff6655"),
    title: "Hormuz Cargo Levy: Fresh Risk to India's Oil Bill",
    description: "A proposed 20% charge on Hormuz cargo could raise energy import costs and shipping risk for India.",
    content: "US President Donald Trump announced a 20% levy on cargo moving through the Strait of Hormuz, alongside talk of tighter pressure on Iranian ports. The strait remains a critical choke point for global oil and LNG.\n\nIndia sources a large share of Gulf crude and gas through this route. A surcharge, if enforced, would raise landed costs for refiners and could feed into domestic fuel prices. Tanker risk and insurance premiums may also rise while conflict risk stays high.\n\nIndian crews are heavily exposed on Gulf routes, so advisories and war-risk cover matter as much as price. Traders who diversified toward Russian crude in recent years still need Gulf barrels and route contingency plans.\n\nTakeaway: importers should stress-test oil CIF costs, check war-risk clauses, and keep alternate loading windows ready.",
    imageUrl: "",
    linkUrl: "https://indianexpress.com/article/world/trump-hormuz-strait-cargo-charge-india-oil-bill-trade-impact-10785159/",
    tags: ["war", "shipping", "oil", "hormuz"],
    isPublished: true,
    createdBy: ObjectId("69b6578559e99879ce2182bd"),
    createdAt: ISODate("2026-07-14T04:01:00.000Z"),
    updatedAt: ISODate("2026-07-14T04:01:00.000Z")
  },
  {
    organizationId: ObjectId("6972184e424ea4761fff6655"),
    title: "UK–India FTA Goes Live From 15 July 2026",
    description: "Historic trade pact enters force with deep tariff cuts. Origin paperwork will decide who gets benefits.",
    content: "The UK–India Free Trade Agreement enters into force on 15 July 2026. Officials say it is among India's most comprehensive FTAs and could boost bilateral trade significantly over time.\n\nIndian exporters get duty-free access on about 99% of exports to the UK. The UK side cuts or removes tariffs across a large share of lines for goods entering India, with staged reductions on sensitive items.\n\nPreferential rates are not automatic. Shipments must meet rules of origin, and UK exporters need HMRC origin registration for self-certified declarations. India's Finance Ministry has also notified origin-determination rules effective the same date.\n\nTakeaway: update HS codes, supplier declarations and COO/origin SOPs before claiming lower duty. Wrong origin claims can mean duty recovery and penalties.",
    imageUrl: "",
    linkUrl: "https://www.gov.uk/government/news/the-countdown-begins-uk-india-fta-enters-into-force-on-july-15th",
    tags: ["fta", "uk", "customs", "tariff"],
    isPublished: true,
    createdBy: ObjectId("69b6578559e99879ce2182bd"),
    createdAt: ISODate("2026-07-14T04:02:00.000Z"),
    updatedAt: ISODate("2026-07-14T04:02:00.000Z")
  },
  {
    organizationId: ObjectId("6972184e424ea4761fff6655"),
    title: "New Origin Rules Notified for India–UK Trade Pact",
    description: "CBIC origin rules decide which goods qualify for preferential tariffs under the UK deal.",
    content: "India's Finance Ministry has notified Customs Tariff (Determination of Origin of Goods under CETA between India and the UK) Rules, 2026, effective 15 July 2026.\n\nA certificate or declaration of origin is central to claiming FTA duty benefits. The rules are meant to stop third-country goods from wrongly enjoying preferential rates.\n\nAuthorised entities in both countries can issue origin documents as permitted. Exporters in textiles, engineering and other high-volume UK lines should align bills of materials and supplier proofs with the new criteria.\n\nTakeaway: before shipping under the FTA, confirm product-specific origin criteria (CTC / RVC / specific process) and keep audit-ready documents.",
    imageUrl: "",
    linkUrl: "https://economictimes.indiatimes.com/news/economy/foreign-trade/india-uk-trade-pact-new-rules-for-determining-goods-origin-effective-july-15-2026/articleshow/132183507.cms",
    tags: ["customs", "origin", "fta", "cbic"],
    isPublished: true,
    createdBy: ObjectId("69b6578559e99879ce2182bd"),
    createdAt: ISODate("2026-07-14T04:03:00.000Z"),
    updatedAt: ISODate("2026-07-14T04:03:00.000Z")
  },
  {
    organizationId: ObjectId("6972184e424ea4761fff6655"),
    title: "June Exports Up 15.5%, Led by Engineering & Electronics",
    description: "Strong export momentum continues, but a sharp import spike still widened the deficit.",
    content: "India's goods exports rose 15.5% in June 2026 to $40.41 billion. Engineering goods grew about 21% to around $11.5 billion, while electronics climbed into the top export categories.\n\nGrowth support also came from rice, iron ore, handicrafts, meat and dairy, and marine products. Exporters credit FTAs, market diversification and competitiveness for double-digit growth.\n\nImports still rose faster, so the headline deficit widened. Shipments to the US, India's largest export market, were soft in June even as imports from the US rose.\n\nTakeaway: exporters in engineering and electronics should lock capacity and freight early; US-facing sellers should watch demand and any tariff policy shifts.",
    imageUrl: "",
    linkUrl: "https://www.thehindubusinessline.com/economy/goods-exports-rise-155-in-june/article71217921.ece",
    tags: ["exports", "engineering", "electronics"],
    isPublished: true,
    createdBy: ObjectId("69b6578559e99879ce2182bd"),
    createdAt: ISODate("2026-07-14T04:04:00.000Z"),
    updatedAt: ISODate("2026-07-14T04:04:00.000Z")
  },
  {
    organizationId: ObjectId("6972184e424ea4761fff6655"),
    title: "West Asia Trade Recovers After Conflict Disruptions",
    description: "Gulf-bound Indian exports have bounced back toward pre-war levels as routes adjust.",
    content: "India's exports to West Asia recovered after earlier conflict-related disruptions. Officials said June shipments to the region grew about 7.3% year-on-year to around $5 billion after a volatile stretch.\n\nIn the April–June quarter, overall goods exports still rose about 15% despite Iran-related war shocks. Traders shifted to alternate shipping routes when Gulf lanes were disrupted, and exports to Gulf markets improved from the March trough.\n\nAn interim easing in regional tensions had helped oil prices and India's macro outlook, but renewed Hormuz risk means freight and insurance can swing quickly again.\n\nTakeaway: keep dual routing options for Gulf cargo and reprice CIF/CFR offers when war-risk premiums move.",
    imageUrl: "",
    linkUrl: "https://economictimes.indiatimes.com/news/economy/foreign-trade/indias-trade-deficit-widens-to-30-43-bn-in-june-as-against-28-21-bn-in-may/articleshow/132358512.cms",
    tags: ["war", "west-asia", "shipping", "exports"],
    isPublished: true,
    createdBy: ObjectId("69b6578559e99879ce2182bd"),
    createdAt: ISODate("2026-07-14T04:05:00.000Z"),
    updatedAt: ISODate("2026-07-14T04:05:00.000Z")
  },
  {
    organizationId: ObjectId("6972184e424ea4761fff6655"),
    title: "Crude & Fertilizer Imports Spike: Cash Flow Alert",
    description: "High global prices pushed crude up 40% and fertilizer imports roughly tripled in June.",
    content: "June import data showed crude shipments jumping over 40% to about $19.3 billion. Fertilizer imports roughly trebled to around $2.3 billion, reflecting both price and volume effects.\n\nGold imports rose more modestly (about 7%), while silver imports fell sharply as prices cooled and duty effects played out. Electronics and machinery imports also stayed strong.\n\nFor trading firms, the story is cash-flow: bigger invoices, higher duty outlay, and more bank limits tied up in high-value cargoes.\n\nTakeaway: importers in oil, fertilizer and electronics should renegotiate payment terms and hedge price where possible before the next buying cycle.",
    imageUrl: "",
    linkUrl: "https://timesofindia.indiatimes.com/business/india-business/indias-trade-deficit-hits-5-month-high-as-imports-surge/articleshow/132378672.cms",
    tags: ["imports", "crude", "fertilizer", "gold"],
    isPublished: true,
    createdBy: ObjectId("69b6578559e99879ce2182bd"),
    createdAt: ISODate("2026-07-14T04:06:00.000Z"),
    updatedAt: ISODate("2026-07-14T04:06:00.000Z")
  },
  {
    organizationId: ObjectId("6972184e424ea4761fff6655"),
    title: "Electronics Imports Jump Nearly 59% in June",
    description: "Rising domestic demand pulled in more electronic goods, adding pressure to the trade gap.",
    content: "Electronic goods imports jumped about 58.8% year-on-year to roughly $13.36 billion in June 2026, according to government quick estimates.\n\nCommerce officials linked part of the surge to rising middle-class demand and higher disposable incomes. Petroleum, gold and electronics together added a large chunk to the wider trade deficit.\n\nFor import-export businesses in consumer electronics, components and related logistics, volumes look strong but margins depend on duty, freight and FX.\n\nTakeaway: map HSN duties carefully, check any PLI/local-content angles, and lock FX for big electronics LCs.",
    imageUrl: "",
    linkUrl: "https://www.thehindubusinessline.com/economy/goods-exports-rise-155-in-june/article71217921.ece",
    tags: ["electronics", "imports", "demand"],
    isPublished: true,
    createdBy: ObjectId("69b6578559e99879ce2182bd"),
    createdAt: ISODate("2026-07-14T04:07:00.000Z"),
    updatedAt: ISODate("2026-07-14T04:07:00.000Z")
  }
])
