use serde::{Deserialize, Serialize};

const MIN_NOTE: u8 = 36; // C2
const MAX_NOTE: u8 = 72; // C5

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreNote {
    pub keys: Option<Vec<String>>,
    #[serde(rename = "startTime")]
    pub start_time: f64,
    #[serde(rename = "endTime")]
    pub end_time: f64,
    pub rest: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Score {
    pub song: String,
    pub bpm: u32,
    pub notes: Vec<ScoreNote>,
    #[serde(rename = "totalTime")]
    pub total_time: Option<f64>,
}

/// Convert MIDI note number to key name (e.g., 60 -> "c4")
fn midi_note_to_key_name(midi: u8) -> String {
    let note_names = ["c", "c", "d", "d", "e", "f", "f", "g", "g", "a", "a", "b"];
    let is_sharp = [
        false, true, false, true, false, false, true, false, true, false, true, false,
    ];

    let note_index = (midi % 12) as usize;
    let octave = (midi / 12) as i32 - 1;

    let note_name = note_names[note_index];
    let sharp_part = if is_sharp[note_index] { "b" } else { "" };

    format!("{}{}{}", note_name, octave, sharp_part)
}

/// Apply 3-octave arrangement to a Score
/// Transposes each note to fit within C2-C5 range by octave shifting
/// This preserves musical intervals (all C notes stay as C, all D notes stay as D, etc.)
/// while fitting all notes into the playable range
pub fn apply_three_octave_arrangement(score: &Score) -> Score {
    // Create a mapping function that preserves absolute pitch class
    let map_note = |midi: u8| -> u8 {
        let mut adjusted = midi;

        // Shift up by octaves if below range
        while adjusted < MIN_NOTE {
            adjusted += 12;
        }

        // Shift down by octaves if above range
        while adjusted > MAX_NOTE {
            adjusted -= 12;
        }

        adjusted
    };
    
    // Apply mapping to all notes
    let mut arranged_notes = Vec::new();

    for note in &score.notes {
        if note.rest.unwrap_or(false) {
            // Keep rest notes as-is
            arranged_notes.push(note.clone());
            continue;
        }

        if let Some(keys) = &note.keys {
            let mut arranged_keys = Vec::new();

            for key_name in keys {
                if let Some(midi) = key_name_to_midi(key_name) {
                    let mapped_midi = map_note(midi);
                    arranged_keys.push(midi_note_to_key_name(mapped_midi));
                }
            }

            if !arranged_keys.is_empty() {
                arranged_notes.push(ScoreNote {
                    keys: Some(arranged_keys),
                    start_time: note.start_time,
                    end_time: note.end_time,
                    rest: None,
                });
            } else {
                // If all keys were filtered out, convert to rest
                arranged_notes.push(ScoreNote {
                    keys: None,
                    start_time: note.start_time,
                    end_time: note.end_time,
                    rest: Some(true),
                });
            }
        }
    }

    Score {
        song: score.song.clone(),
        bpm: score.bpm,
        notes: arranged_notes,
        total_time: score.total_time,
    }
}

/// Convert key name (e.g., "c4", "c4b") to MIDI note number
fn key_name_to_midi(key_name: &str) -> Option<u8> {
    let note_map: std::collections::HashMap<&str, u8> = [
        ("c", 0),
        ("d", 2),
        ("e", 4),
        ("f", 5),
        ("g", 7),
        ("a", 9),
        ("b", 11),
    ]
    .iter()
    .cloned()
    .collect();

    // Parse format: c4, c4b (sharp), c-1 (negative octave)
    let chars: Vec<char> = key_name.chars().collect();
    if chars.is_empty() {
        return None;
    }

    let note_char = chars[0];
    let base_note = note_map.get(&note_char.to_string() as &str)?;

    // Check if last char is 'b' (sharp notation)
    let is_sharp = chars.len() > 2 && chars[chars.len() - 1] == 'b';
    
    // Extract octave string (everything between note and optional 'b')
    let octave_end = if is_sharp { chars.len() - 1 } else { chars.len() };
    let octave_str: String = chars[1..octave_end].iter().collect();
    
    if octave_str.is_empty() {
        return None;
    }
    
    let octave: i32 = octave_str.parse().ok()?;

    let note_in_octave = base_note + if is_sharp { 1 } else { 0 };
    let midi = ((octave + 1) * 12) as u8 + note_in_octave;

    Some(midi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_midi_note_to_key_name() {
        assert_eq!(midi_note_to_key_name(36), "c2");
        assert_eq!(midi_note_to_key_name(60), "c4");
        assert_eq!(midi_note_to_key_name(61), "c4b");
        assert_eq!(midi_note_to_key_name(72), "c5");
    }

    #[test]
    fn test_key_name_to_midi() {
        assert_eq!(key_name_to_midi("c2"), Some(36));
        assert_eq!(key_name_to_midi("c4"), Some(60));
        assert_eq!(key_name_to_midi("c4b"), Some(61));
        assert_eq!(key_name_to_midi("c5"), Some(72));
    }

    #[test]
    fn test_apply_three_octave_arrangement() {
        // Test with notes spanning multiple octaves
        let score = Score {
            song: "Test".to_string(),
            bpm: 120,
            notes: vec![
                ScoreNote {
                    keys: Some(vec!["c6".to_string()]),
                    start_time: 0.0,
                    end_time: 500.0,
                    rest: None,
                },
                ScoreNote {
                    keys: Some(vec!["c1".to_string()]),
                    start_time: 500.0,
                    end_time: 1000.0,
                    rest: None,
                },
            ],
            total_time: Some(1000.0),
        };

        let arranged = apply_three_octave_arrangement(&score);

        assert_eq!(arranged.notes.len(), 2);
        
        // C6 (84) and C1 (24) have center at 54
        // C2-C5 center is 54, so no shift needed
        // C6 stays at 72 (max), C1 becomes 36 (min)
        assert_eq!(arranged.notes[0].keys, Some(vec!["c5".to_string()])); // C6 clamped to C5
        assert_eq!(arranged.notes[1].keys, Some(vec!["c2".to_string()])); // C1 clamped to C2
    }
    
    #[test]
    fn test_apply_three_octave_arrangement_already_in_range() {
        // Test with notes already in C2-C5 range
        let score = Score {
            song: "Test".to_string(),
            bpm: 120,
            notes: vec![
                ScoreNote {
                    keys: Some(vec!["c4".to_string()]),
                    start_time: 0.0,
                    end_time: 500.0,
                    rest: None,
                },
            ],
            total_time: Some(500.0),
        };

        let arranged = apply_three_octave_arrangement(&score);

        assert_eq!(arranged.notes.len(), 1);
        // C4 (60) is at center of C2-C5 range, so no shift needed
        assert_eq!(arranged.notes[0].keys, Some(vec!["c4".to_string()]));
    }
}
