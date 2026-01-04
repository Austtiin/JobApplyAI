// Resume Parser - Extracts information from resume text

export class ResumeParser {
  /**
   * Parse resume text and extract structured data
   */
  static parseResumeText(text) {
    const profile = {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      website: '',
      yearsExperience: 0,
      skills: [],
      summary: ''
    };

    // Extract email
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      profile.email = emailMatch[0];
    }

    // Extract phone
    const phoneMatch = text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) {
      profile.phone = phoneMatch[0];
    }

    // Extract LinkedIn
    const linkedinMatch = text.match(/(?:linkedin\.com\/in\/)([\w-]+)|LinkedIn\s*\n\s*(https?:\/\/[^\s]+)/i);
    if (linkedinMatch) {
      profile.linkedin = linkedinMatch[1] ? `https://linkedin.com/in/${linkedinMatch[1]}` : linkedinMatch[2];
    }

    // Extract GitHub
    const githubMatch = text.match(/(?:github\.com\/)([\w-]+)|GitHub\s*\n\s*(https?:\/\/[^\s]+)/i);
    if (githubMatch) {
      profile.github = githubMatch[1] ? `https://github.com/${githubMatch[1]}` : githubMatch[2];
    }

    // Extract website
    const websiteMatch = text.match(/(?:https?:\/\/)?([\w-]+\.[\w-]+\.\w+)/);
    if (websiteMatch && !websiteMatch[0].includes('linkedin') && !websiteMatch[0].includes('github')) {
      profile.website = websiteMatch[0].startsWith('http') ? websiteMatch[0] : `https://${websiteMatch[0]}`;
    }

    // Extract name (first line of CONTACT section or first capitalized line)
    const nameMatch = text.match(/CONTACT\s*\n\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    if (nameMatch) {
      profile.fullName = nameMatch[1];
    } else {
      const firstNameMatch = text.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)/m);
      if (firstNameMatch) {
        profile.fullName = firstNameMatch[1];
      }
    }

    // Extract location
    const locationMatch = text.match(/([A-Z][a-z]+,\s*[A-Z]{2})/);
    if (locationMatch) {
      profile.location = locationMatch[1];
    }

    // Extract summary
    const summaryMatch = text.match(/SUMMARY\s*\n\s*([\s\S]*?)(?=\n\n|KEY SKILLS|CERTIFICATIONS|PROFESSIONAL)/i);
    if (summaryMatch) {
      profile.summary = summaryMatch[1].trim();
    }

    // Extract skills
    const skillsMatch = text.match(/KEY SKILLS\s*\n\s*([\s\S]*?)(?=\n\n|CERTIFICATIONS|PROFESSIONAL)/i);
    if (skillsMatch) {
      const skillsText = skillsMatch[1];
      profile.skills = skillsText
        .split(/\n|,/)
        .map(s => s.trim())
        .filter(s => s && s.length > 2 && s.length < 50);
    }

    // Calculate years of experience (from earliest job start to now)
    const yearMatches = text.match(/\b(20\d{2})\b/g);
    if (yearMatches && yearMatches.length > 0) {
      const years = yearMatches.map(y => parseInt(y));
      const earliestYear = Math.min(...years);
      const currentYear = new Date().getFullYear();
      profile.yearsExperience = currentYear - earliestYear;
    }

    return profile;
  }

  /**
   * Load resume from file path and parse
   */
  static async loadAndParseResume(filePath) {
    try {
      const response = await fetch(chrome.runtime.getURL(filePath));
      const text = await response.text();
      return this.parseResumeText(text);
    } catch (error) {
      console.error('Failed to load resume:', error);
      return null;
    }
  }
}
